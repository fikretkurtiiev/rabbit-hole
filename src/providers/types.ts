import type { ProviderId } from '@/settings/schema';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type Chunk = { type: 'text'; text: string } | { type: 'usage'; usage: Usage };

export interface StreamOptions {
  model: string;
  system: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string;
  displayName: string;
}

export type KeyTestResult = 'valid' | 'invalid' | 'network' | 'rate_limited' | 'error';

export interface ChatProvider {
  id: ProviderId;
  streamChat(messages: ChatMessage[], opts: StreamOptions): AsyncIterable<Chunk>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  testKey(signal?: AbortSignal): Promise<KeyTestResult>;
}
