import type { Pool } from 'pg';
import type { PriceObservation, PriceSink, SourceStatus } from './model.js';

/** Transactional current-value and append-only price change history. */
export class PostgresPriceStore implements PriceSink {
  constructor(private readonly db: Pool) {}

  async recordPrice(input: PriceObservation): Promise<boolean> {
    if (!input.buy && !input.sell) throw new Error('At least one price is required');
    if (!Number.isFinite(input.observedAt.getTime())) throw new Error('Invalid observation time');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Cooperative writers for the same source/instrument serialize. The hash
      // may collide, resulting in extra serialization but not incorrect data.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))",
        [input.sourceCode, input.instrumentCode],
      );
      const before = await client.query<{
        buy_price: string | null;
        sell_price: string | null;
        observed_at: Date;
      }>(
        `SELECT buy_price::text, sell_price::text, observed_at
         FROM current_prices WHERE source_code=$1 AND instrument_code=$2 FOR UPDATE`,
        [input.sourceCode, input.instrumentCode],
      );
      const previous = before.rows[0];
      if (previous && input.observedAt.getTime() <= previous.observed_at.getTime()) {
        await client.query('COMMIT');
        return false; // out-of-order or same-timestamp result
      }
      const changed = !previous ||
        previous.buy_price !== input.buy || previous.sell_price !== input.sell;

      await client.query(
        `INSERT INTO current_prices
          (source_code,instrument_code,buy_price,sell_price,observed_at)
         VALUES ($1,$2,$3::numeric,$4::numeric,$5)
         ON CONFLICT (source_code,instrument_code) DO UPDATE SET
           buy_price=EXCLUDED.buy_price, sell_price=EXCLUDED.sell_price,
           observed_at=EXCLUDED.observed_at, updated_at=now()`,
        [input.sourceCode, input.instrumentCode, input.buy, input.sell, input.observedAt],
      );
      if (changed) {
        await client.query(
          `INSERT INTO price_ticks
           (source_code,instrument_code,buy_price,sell_price,observed_at)
           VALUES ($1,$2,$3::numeric,$4::numeric,$5)`,
          [input.sourceCode, input.instrumentCode, input.buy, input.sell, input.observedAt],
        );
      }
      await client.query('COMMIT');
      return changed;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordHealth(code: string, status: SourceStatus): Promise<void> {
    await this.db.query(
      `INSERT INTO source_health
        (source_code,status,consecutive_failures,last_success_at,last_error_at)
       VALUES ($1,$2,CASE WHEN $2='error' THEN 1 ELSE 0 END,
         CASE WHEN $2='ok' THEN now() END,CASE WHEN $2='error' THEN now() END)
       ON CONFLICT (source_code) DO UPDATE SET
         status=EXCLUDED.status,
         consecutive_failures=CASE WHEN $2='error'
           THEN source_health.consecutive_failures+1
           WHEN $2='ok' THEN 0 ELSE source_health.consecutive_failures END,
         last_success_at=COALESCE(EXCLUDED.last_success_at,source_health.last_success_at),
         last_error_at=COALESCE(EXCLUDED.last_error_at,source_health.last_error_at),
         updated_at=now()`,
      [code, status],
    );
  }
}
