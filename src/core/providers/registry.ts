import { mimoProvider } from './mimo';
import { openaiCompatibleProvider } from './openai-compatible';
import { qwen3Provider } from './qwen3';
import { webspeechProvider } from './webspeech';
import type { TtsProvider } from './types';

/** 供应商注册表（借鉴 aloud-tts 的 REGISTRY 模式）：新供应商在此登记即全插件可用。 */
export const PROVIDER_LIST: TtsProvider[] = [
  openaiCompatibleProvider,
  qwen3Provider,
  mimoProvider,
  webspeechProvider,
];

export const PROVIDERS: Record<string, TtsProvider> = Object.fromEntries(
  PROVIDER_LIST.map((p) => [p.id, p]),
);

export function getProvider(id: string): TtsProvider | undefined {
  return PROVIDERS[id];
}

export { webspeechProvider };
