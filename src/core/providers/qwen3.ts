import { trimBaseUrl } from './openai-compatible';
import type { HealthResult, SynthesizeInput, SynthesizeResult, TtsProvider } from './types';
import { obsidianHttp } from './http';

/** 本地 Qwen3-TTS 服务（如 127.0.0.1:8765）的内置候选音色，端点不可用时兜底。 */
export const QWEN3_FALLBACK_VOICES = [
  'Serena',
  'Vivian',
  'Uncle_Fu',
  'Dylan',
  'Eric',
  'Ryan',
  'Aiden',
  'Ono_Anna',
  'Sohee',
];

export function voicesEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/api/voices`;
}

export function healthEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/health`;
}

/** Qwen3 请求体在 OpenAI 兼容基础上加 language。 */
export function buildQwen3Body(input: SynthesizeInput, model?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    input: input.text,
    voice: input.voice,
    language: input.language,
  };
  if (model) body.model = model;
  return body;
}

/** GET /api/voices → { "Serena": {...}, ... }，取对象键为音色列表。 */
export function parseVoicesResponse(json: unknown): string[] {
  if (json && typeof json === 'object') {
    const keys = Object.keys(json as Record<string, unknown>);
    if (keys.length) return keys;
  }
  return [];
}

/**
 * Qwen3-TTS 专属适配器：OpenAI 兼容合成端点 + language 参数 + 音色发现 + 健康检查，返回 WAV。
 */
export const qwen3Provider: TtsProvider = {
  id: 'qwen3-tts',
  name: 'Qwen3-TTS',
  capabilities: { cacheable: true, pregeneratable: true, voiceList: true, direct: false },
  defaults: () => ({ baseUrl: 'http://127.0.0.1:8765', voice: 'Serena', language: 'Chinese' }),
  async listVoices(account, http = obsidianHttp): Promise<string[]> {
    if (!account.baseUrl) return QWEN3_FALLBACK_VOICES;
    try {
      const res = await http({ url: voicesEndpoint(account.baseUrl), method: 'GET' });
      if (res.status === 200) {
        const voices = parseVoicesResponse(res.json);
        if (voices.length) return voices;
      }
    } catch {
      /* 服务未启动时用默认列表 */
    }
    return QWEN3_FALLBACK_VOICES;
  },
  async checkHealth(account, http = obsidianHttp): Promise<HealthResult> {
    if (!account.baseUrl) return { ok: false, message: 'missing baseUrl' };
    try {
      const res = await http({ url: healthEndpoint(account.baseUrl), method: 'GET' });
      const ready = !!(res.json && (res.json as { ready?: boolean }).ready);
      return { ok: res.status === 200 && ready };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async synthesize(account, input, http = obsidianHttp): Promise<SynthesizeResult> {
    if (!account.baseUrl) throw new Error('missing baseUrl');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (account.apiKey) headers.Authorization = `Bearer ${account.apiKey}`;
    const res = await http({
      url: `${trimBaseUrl(account.baseUrl)}/v1/audio/speech`,
      method: 'POST',
      headers,
      body: JSON.stringify(buildQwen3Body(input, account.model)),
    });
    if (res.status !== 200) {
      const detail = res.text ? `: ${res.text.slice(0, 120)}` : '';
      throw new Error(`TTS HTTP ${res.status}${detail}`);
    }
    const data = res.arrayBuffer;
    if (!data || data.byteLength === 0) throw new Error('TTS 返回空');
    return { data, mime: 'audio/wav' };
  },
};
