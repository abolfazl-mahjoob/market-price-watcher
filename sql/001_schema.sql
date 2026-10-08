CREATE TABLE IF NOT EXISTS current_prices (
  source_code text NOT NULL,
  instrument_code text NOT NULL,
  buy_price numeric(24, 2),
  sell_price numeric(24, 2),
  observed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_code, instrument_code),
  CONSTRAINT current_has_price CHECK (buy_price IS NOT NULL OR sell_price IS NOT NULL),
  CONSTRAINT current_positive CHECK (
    (buy_price IS NULL OR buy_price > 0) AND (sell_price IS NULL OR sell_price > 0)
  )
);

CREATE TABLE IF NOT EXISTS price_ticks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_code text NOT NULL,
  instrument_code text NOT NULL,
  buy_price numeric(24, 2),
  sell_price numeric(24, 2),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_ticks_lookup
 ON price_ticks (source_code, instrument_code, observed_at DESC);

CREATE TABLE IF NOT EXISTS source_health (
  source_code text PRIMARY KEY,
  status text NOT NULL CHECK(status IN ('ok','error','stopped')),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
