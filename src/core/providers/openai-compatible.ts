import type {
  HealthResult,
  HttpFn,
  SynthesizeInput,
  SynthesizeResult,
  TtsAccountConfig,
  TtsProvider,
} from './types';
import { obsidianHttp } from './http';

/** 去掉 baseUrl 尾部斜杠。 */
export function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** POST {baseUrl}/v1/audio/speech */
export function speechEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/v1/audio/speech`;
}

/** OpenAI 兼容请求体：input + voice（+ 可选 model）。 */
export function buildSpeechBody(input: SynthesizeInput, model?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { input: input.text, voice: input.voice };
  if (model) body.model = model;
  return body;
}

export function bearerHeaders(account: TtsAccountConfig): Record<string, string> {
  return account.apiKey ? { Authorization: `Bearer ${account.apiKey}` } : {};
}

function mimeFromResponse(res: { headers?: Record<string, string> }, fallback: string): string {
  const ct = res.headers?.['content-type'] ?? res.headers?.['Content-Type'] ?? '';
  return ct.includes('audio/') ? ct.split(';')[0] : fallback;
}

/**
 * OpenAI 兼容端点（任意 /v1/audio/speech 形态的自托管或云端服务）。
 * 音色为自由填写（各服务音色名不统一），无音色发现端点。
 */
export const openaiCompatibleProvider: TtsProvider = {
  id: 'openai-compatible',
  name: 'OpenAI 兼容端点',
  capabilities: { cacheable: true, pregeneratable: true, voiceList: false, direct: false },
  defaults: () => ({ baseUrl: 'http://127.0.0.1:8880', voice: 'alloy', language: 'Chinese' }),
  async listVoices() {
    // 各兼容服务音色名不统一，无发现端点：UI 呈现为自由填写
    return [];
  },
  async checkHealth(account, http = obsidianHttp): Promise<HealthResult> {
    try {
      await synthesizeSpeech(
        account,
        { text: '你好', voice: account.voice, language: account.language },
        http,
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async synthesize(account, input, http = obsidianHttp): Promise<SynthesizeResult> {
    return synthesizeSpeech(account, input, http);
  },
};

async function synthesizeSpeech(
  account: TtsAccountConfig,
  input: SynthesizeInput,
  http: HttpFn,
): Promise<SynthesizeResult> {
  if (!account.baseUrl) throw new Error('missing baseUrl');
  const res = await http({
    url: speechEndpoint(account.baseUrl),
    method: 'POST',
    headers: { ...bearerHeaders(account), 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSpeechBody(input, account.model)),
  });
  if (res.status !== 200) {
    const detail = res.text ? `: ${res.text.slice(0, 120)}` : '';
    throw new Error(`TTS HTTP ${res.status}${detail}`);
  }
  const data = res.arrayBuffer;
  if (!data || data.byteLength === 0) throw new Error('TTS 返回空');
  return { data, mime: mimeFromResponse(res, 'audio/mpeg') };
}
