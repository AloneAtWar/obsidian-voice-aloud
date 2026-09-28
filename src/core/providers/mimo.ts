import {
  MIMO_DEFAULT_HOST,
  MIMO_MODEL,
  buildMimoMessages,
  bytesToArrayBuffer,
  extractMimoAudio,
  mimoEndpoint,
  mimoErrorMessageFrom,
  type MimoChatResponse,
} from './mimo-audio';
import type {
  HealthResult,
  HttpFn,
  SynthesizeResult,
  TtsAccountConfig,
  TtsProvider,
} from './types';
import { obsidianHttp } from './http';

export const MIMO_VOICES = [
  'mimo_default',
  '冰糖',
  '茉莉',
  '苏打',
  '白桦',
  'Mia',
  'Chloe',
  'Milo',
  'Dean',
];

/** MiMo 双认证头：api-key 键 + Bearer。 */
export function mimoAuthHeaders(apiKey: string): Record<string, string> {
  return { 'api-key': apiKey, Authorization: `Bearer ${apiKey}` };
}

/** MiMo 合成请求体。 */
export function buildMimoRequestBody(
  text: string,
  voice: string,
  style?: string,
): Record<string, unknown> {
  return {
    model: MIMO_MODEL,
    messages: buildMimoMessages(text, style),
    audio: { format: 'mp3', voice },
  };
}

async function synthesizeMimo(
  account: TtsAccountConfig,
  text: string,
  http: HttpFn,
): Promise<ArrayBuffer> {
  const host = account.baseUrl || MIMO_DEFAULT_HOST;
  const res = await http({
    url: mimoEndpoint(host),
    method: 'POST',
    headers: {
      ...mimoAuthHeaders(account.apiKey ?? ''),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildMimoRequestBody(text, account.voice, account.extra?.['style'])),
  });
  if (res.status === 401) throw new Error('MiMo: invalid API key (HTTP 401)');
  if (res.status === 429) throw new Error('MiMo: rate limit or quota reached (HTTP 429)');
  if (res.status >= 400) {
    const detail = mimoErrorMessageFrom((res.json ?? {}) as MimoChatResponse);
    throw new Error(`MiMo HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const result = extractMimoAudio((res.json ?? {}) as Parameters<typeof extractMimoAudio>[0]);
  if (!result.ok) throw new Error(`MiMo: ${result.error}`);
  return bytesToArrayBuffer(result.bytes);
}

/**
 * Xiaomi MiMo TTS 适配器。账号的 baseUrl 填 host（无协议，如 api.xiaomimimo.com），
 * 风格指令配置在账号 extra.style。
 */
export const mimoProvider: TtsProvider = {
  id: 'mimo',
  name: 'Xiaomi MiMo TTS',
  capabilities: { cacheable: true, pregeneratable: true, voiceList: false, direct: false },
  defaults: () => ({ baseUrl: MIMO_DEFAULT_HOST, voice: 'mimo_default', language: 'Chinese' }),
  async listVoices() {
    return MIMO_VOICES;
  },
  async checkHealth(account, http = obsidianHttp): Promise<HealthResult> {
    if (!account.apiKey) return { ok: false, message: 'missing API key' };
    try {
      await synthesizeMimo(account, '.', http);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async synthesize(account, input, http = obsidianHttp): Promise<SynthesizeResult> {
    const data = await synthesizeMimo(account, input.text, http);
    return { data, mime: 'audio/mpeg' };
  },
};
