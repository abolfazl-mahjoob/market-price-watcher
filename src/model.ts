export interface PriceObservation {
  sourceCode: string;
  instrumentCode: string;
  buy: string | null;
  sell: string | null;
  observedAt: Date;
}
export type SourceStatus = 'ok' | 'error' | 'stopped';
export interface PriceSink {
  recordPrice(item: PriceObservation): Promise<boolean>;
  recordHealth(source: string, status: SourceStatus): Promise<void>;
}
export interface ObservationReader {
  read(): Promise<PriceObservation[]>;
  reset(): Promise<void>;
  close(): Promise<void>;
}
