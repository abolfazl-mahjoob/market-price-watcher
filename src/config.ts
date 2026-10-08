export interface InstrumentConfig {
  code: string;
  buySelector?: string;
  sellSelector?: string;
}

export interface SourceConfig {
  code: string;
  url: string;
  intervalMs: number;
  timeoutMs: number;
  instruments: InstrumentConfig[];
  /** Only for a controlled local fixture; never allow production private-network crawling. */
  allowLocalhost?: boolean;
}

const CODE = /^[a-z][a-z0-9_-]{1,63}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function validateSources(raw: unknown): SourceConfig[] {
  if (!raw || typeof raw !== 'object' || !('sources' in raw)) {
    throw new Error('Expected a config object with sources');
  }
  const sources = (raw as { sources: unknown }).sources;
  if (!Array.isArray(sources) || sources.length > 20) {
    throw new Error('sources must be an array of no more than 20');
  }
  const seen = new Set<string>();
  return sources.map((input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid source');
    const source = input as Partial<SourceConfig>;
    if (!source.code || !CODE.test(source.code) || seen.has(source.code)) {
      throw new Error('Invalid or duplicate source code');
    }
    seen.add(source.code);
    if (typeof source.url !== 'string') throw new Error('Source URL required');
    const url = new URL(source.url);
    const local = LOOPBACK.has(url.hostname);
    if (url.username || url.password || url.hash ||
        (url.protocol !== 'https:' && !(local && source.allowLocalhost === true && url.protocol === 'http:'))) {
      throw new Error('Only configured HTTPS URLs (or explicit local fixtures) are permitted');
    }
    if (!Number.isInteger(source.intervalMs) || source.intervalMs! < 1000 ||
        source.intervalMs! > 86_400_000) throw new Error('Invalid source interval');
    if (!Number.isInteger(source.timeoutMs) || source.timeoutMs! < 500 ||
        source.timeoutMs! > 60_000) throw new Error('Invalid source timeout');
    if (!Array.isArray(source.instruments) || source.instruments.length < 1 ||
        source.instruments.length > 100) throw new Error('Invalid instruments');
    const instruments = new Set<string>();
    for (const instrument of source.instruments) {
      if (!instrument || typeof instrument.code !== 'string' ||
          !CODE.test(instrument.code) || instruments.has(instrument.code)) {
        throw new Error('Invalid or duplicate instrument code');
      }
      instruments.add(instrument.code);
      if (!instrument.buySelector?.trim() && !instrument.sellSelector?.trim()) {
        throw new Error('Instrument requires at least one selector');
      }
    }
    return source as SourceConfig;
  });
}
