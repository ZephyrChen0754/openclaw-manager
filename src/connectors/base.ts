import { BindingRecord, NormalizedInboundMessage } from '../types';

export interface ConnectorAdapter {
  source_type: string;
  normalize(payload: Record<string, unknown>): NormalizedInboundMessage;
}

export interface BindingRegistry {
  add(binding: BindingRecord): Promise<BindingRecord>;
  list(): Promise<BindingRecord[]>;
}

