import type {
  HealthResult,
  HttpFn,
  SynthesizeInput,
  SynthesizeResult,
  TtsAccountConfig,
  TtsProvider,
} from './types';
import { obsidianHttp } from './http';
import { trimBaseUrl } from './openai-compatible';

/** 官方 API 根地址。账号里的服务地址留空时用它。 */
export const DEEPSEEK_DEFAULT_BASE = 'https://api.deepseek.com';

/** 固定音色。id 是请求里的 voice_id，label 是播放面板上的名字。 */
export const DEEPSEEK_VOICES = [
  { id: 'stella', label: '海星（女声）' },
  { id: 'tide', label: '暗潮（男声）' },
] as const;

export const DEEPSEEK_VOICE_LABELS: Record<string, string> = Object.fromEntries(
  DEEPSEEK_VOICES.map((v) => [v.id, v.label]),
);

/** POST {base}/v1/tools/tts。base 只填到主机，不要带路径。 */
export function deepseekTtsEndpoint(baseUrl?: string): string {
  return `${trimBaseUrl(baseUrl?.trim() || DEEPSEEK_DEFAULT_BASE)}/v1/tools/tts`;
}

/**
 * 整段合成请求体。
 * filter_markdown 打开：正文进供应商前已经去掉大部分 Markdown，标题没有走那一步，
 * 交给接口去掉标题里残留的标记。语种不传，接口按文本识别。
 */
export function buildDeepseekBody(text: string, voice: string): Record<string, unknown> {
  return {
    text,
    voice_id: voice.trim() || 'stella',
    format: 'wav',
    filter_markdown: true,
  };
}

function errorMessage(status: number, text?: string): string {
  const detail = text ? `: ${text.slice(0, 120)}` : '';
  if (status === 401 || status === 403) return `DeepSeek: invalid API key (HTTP ${status})`;
  if (status === 429) return 'DeepSeek: too many requests in progress (HTTP 429)';
  if (status === 503) return 'DeepSeek: service busy (HTTP 503)';
  return `DeepSeek HTTP ${status}${detail}`;
}

/**
 * DeepSeek 语音合成。
 * 文档：https://api-docs.deepseek.com/zh-cn/guides/tts
 * 与 OpenAI `/v1/audio/speech` 的路径和字段都不同，不能复用 openai-compatible。
 */
export const deepseekProvider: TtsProvider = {
  id: 'deepseek-tts',
  name: 'DeepSeek TTS',
  voiceLabels: DEEPSEEK_VOICE_LABELS,
  capabilities: { cacheable: true, pregeneratable: true, voiceList: false, direct: false },
  defaults: () => ({
    baseUrl: DEEPSEEK_DEFAULT_BASE,
    voice: 'stella',
    language: 'Auto',
  }),
  async listVoices() {
    return DEEPSEEK_VOICES.map((v) => v.id);
  },
  async checkHealth(account, http = obsidianHttp): Promise<HealthResult> {
    if (!account.apiKey?.trim()) return { ok: false, message: 'missing API key' };
    try {
      await synthesizeDeepseek(
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
    return synthesizeDeepseek(account, input, http);
  },
};

async function synthesizeDeepseek(
  account: TtsAccountConfig,
  input: SynthesizeInput,
  http: HttpFn,
): Promise<SynthesizeResult> {
  if (!account.apiKey?.trim()) throw new Error('missing API key');
  if (!input.text.trim()) throw new Error('DeepSeek: empty text');
  const res = await http({
    url: deepseekTtsEndpoint(account.baseUrl),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildDeepseekBody(input.text, input.voice)),
  });
  if (res.status !== 200) throw new Error(errorMessage(res.status, res.text));
  const data = res.arrayBuffer;
  if (!data || data.byteLength === 0) throw new Error('DeepSeek 返回空音频');
  return { data, mime: 'audio/wav' };
}
