import type {
  HealthResult,
  SynthesizeInput,
  SynthesizeResult,
  TtsAccountConfig,
  TtsProvider,
} from './types';
import { obsidianHttp } from './http';
import { wrapLanguageSpans } from './language-spans';

/** Azure 语音服务（Speech Service）主机名。 */
const AZURE_HOST = 'tts.speech.microsoft.com';

/** 默认服务区域（新建账号与区域归一化失败时的兜底）。 */
export const AZURE_DEFAULT_REGION = 'eastus';

/**
 * 可选输出格式（按文件大小降序）。
 * 48 kHz / 192 kbps 为默认：HD 音色是 48 kHz 原生合成，压到 24 kHz 等于先降采样再编码，
 * 齿音（s/sh/f）与气声会被切掉 12 kHz 以上部分；96 kbps 约为 192 的 51% 体积、听感接近透明；
 * 24 kHz / 48 kbps 约为 25% 体积，适合移动端缓存紧张时使用。
 */
export const AZURE_OUTPUT_FORMATS = [
  'audio-48khz-192kbitrate-mono-mp3',
  'audio-48khz-96kbitrate-mono-mp3',
  'audio-24khz-48kbitrate-mono-mp3',
] as const;

export type AzureOutputFormat = (typeof AZURE_OUTPUT_FORMATS)[number];

/** 默认输出格式。 */
export const AZURE_DEFAULT_OUTPUT_FORMAT: AzureOutputFormat = 'audio-48khz-192kbitrate-mono-mp3';

/** 账号选定的输出格式；未设置或值非法时回退默认（旧账号无需迁移）。 */
export function outputFormatFor(account: TtsAccountConfig): AzureOutputFormat {
  const v = account.extra?.['outputFormat'];
  return AZURE_OUTPUT_FORMATS.includes(v as AzureOutputFormat)
    ? (v as AzureOutputFormat)
    : AZURE_DEFAULT_OUTPUT_FORMAT;
}

/** SSML 形态版本：参与音频缓存键。改变请求体生成逻辑时必须递增，否则旧缓存会被继续命中。 */
const SSML_REVISION = 'lang-spans-v3-capability-gated';

/** 音色列表拉取失败或未配置区域时的内置候选音色（第一项即新账号默认音色）。 */
export const AZURE_FALLBACK_VOICES = [
  // 多语言音色：中英混读（<lang> 语言域）需要它，作为默认
  'zh-CN-XiaoxiaoMultilingualNeural',
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunxiNeural',
  // HD 音色名是「角色名:基础模型」的冒号形式，不是连字符拼接
  'zh-CN-Xiaoxiao:DragonHDLatestNeural',
  'en-US-AvaMultilingualNeural',
  'en-US-JennyNeural',
  'en-US-AndrewMultilingualNeural',
  'ja-JP-NanamiNeural',
  'ko-KR-SunHiNeural',
];

/**
 * 区域归一化：接受 "eastus" / "EastUS" / 完整 URL（https://eastus.tts.speech.microsoft.com）。
 * 空值回退默认区域。
 */
export function normalizeRegion(region: string | undefined): string {
  const raw = (region ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const m = /^([a-z0-9-]+)\.tts\.speech\.microsoft\.com/.exec(raw);
  return m ? m[1] : raw || AZURE_DEFAULT_REGION;
}

export function azureUrl(region: string, path: string): string {
  return `https://${normalizeRegion(region)}.${AZURE_HOST}${path}`;
}

/** Azure 用 Ocp-Apim-Subscription-Key 头鉴权（非 Bearer）。 */
export function azureHeaders(apiKey: string | undefined): Record<string, string> {
  return { 'Ocp-Apim-Subscription-Key': (apiKey ?? '').trim() };
}

/** SSML 特殊字符转义。 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 从音色名推导 locale（zh-CN-XiaoxiaoNeural → zh-CN）；无法识别时回退中文。 */
export function localeFromVoice(voice: string): string {
  const m = /^([a-zA-Z]{2,3}[-_][a-zA-Z]{2,4})/.exec(voice ?? '');
  return m ? m[1].replace('_', '-') : 'zh-CN';
}

/**
 * 音色是否支持 <lang xml:lang> 语言域。
 *
 * 微软文档限定该元素「仅多语言音色支持」：给普通音色（如 zh-CN-XiaoxiaoNeural）
 * 发语言标签属于未定义行为，音频可能被拒或读法异常，因此只在有能力的音色上生成。
 * - 多语言音色：ShortName 含 Multilingual（zh-CN-XiaoxiaoMultilingualNeural、en-US-AvaMultilingualNeural…）
 * - HD 音色：ShortName 为「角色:基础模型」冒号形式（zh-CN-Xiaoxiao:DragonHDLatestNeural），
 *   实测接受 <lang> 并会按语言域切换数字读法（100000000：2.88s → 3.34s）
 */
export function supportsLanguageTag(voice: string): boolean {
  const v = (voice ?? '').trim();
  if (!v) return false;
  if (/multilingual/i.test(v)) return true;
  return v.includes(':');
}

/**
 * SSML 请求体：Azure 合成端点只接受 SSML，不接受 JSON。
 * 中英混排时按书写系统分段，外文片段套 <lang xml:lang> 语言域——否则数字会按音色
 * 的原生语言做文本规范化（中文音色把 "50" 读成「五十」）。单一语言文本不产生任何标签。
 * 普通音色不支持该元素：整段保持纯文本，只做 XML 转义。
 */
export function buildAzureSsml(input: SynthesizeInput): string {
  const locale = localeFromVoice(input.voice);
  const body = supportsLanguageTag(input.voice)
    ? wrapLanguageSpans(input.text, locale, escapeXml)
    : escapeXml(input.text);
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"' +
    ` xml:lang="${locale}"><voice name="${input.voice}">` +
    body +
    '</voice></speak>'
  );
}

/** GET /cognitiveservices/voices/list → [{ ShortName, Locale, ... }]，取 ShortName 列表。 */
export function parseAzureVoices(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((v) =>
      v && typeof v === 'object' ? (v as { ShortName?: unknown }).ShortName : undefined,
    )
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/**
 * Azure TTS 适配器：SSML 合成 + 音色发现 + 健康检查，返回 MP3。
 * 端点形如 https://{region}.tts.speech.microsoft.com/cognitiveservices/v1。
 */
export const azureProvider: TtsProvider = {
  id: 'azure-tts',
  name: 'Azure TTS（Azure 语音服务）',
  cacheRevision: SSML_REVISION,
  capabilities: { cacheable: true, pregeneratable: true, voiceList: true, direct: false },
  defaults: () => ({
    region: AZURE_DEFAULT_REGION,
    // 多语言音色：普通音色不支持 <lang> 语言域，中英混读会退回中文数字规范化
    voice: 'zh-CN-XiaoxiaoMultilingualNeural',
    language: 'Chinese',
  }),
  async listVoices(account, http = obsidianHttp): Promise<string[]> {
    if (!account.region) return AZURE_FALLBACK_VOICES;
    try {
      const res = await http({
        url: azureUrl(account.region, '/cognitiveservices/voices/list'),
        method: 'GET',
        headers: azureHeaders(account.apiKey),
      });
      if (res.status === 200) {
        const voices = parseAzureVoices(res.json);
        if (voices.length) return voices;
      }
    } catch {
      /* 网络异常时用默认列表 */
    }
    return AZURE_FALLBACK_VOICES;
  },
  async checkHealth(account, http = obsidianHttp): Promise<HealthResult> {
    if (!account.apiKey) return { ok: false, message: 'missing API key' };
    if (!account.region) return { ok: false, message: 'missing region' };
    try {
      const res = await http({
        url: azureUrl(account.region, '/cognitiveservices/voices/list'),
        method: 'GET',
        headers: azureHeaders(account.apiKey),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Azure: invalid API key (HTTP ${res.status})` };
      }
      if (res.status !== 200) return { ok: false, message: `Azure HTTP ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  async synthesize(account, input, http = obsidianHttp): Promise<SynthesizeResult> {
    if (!account.apiKey) throw new Error('missing API key');
    if (!account.region) throw new Error('missing region');
    const res = await http({
      url: azureUrl(account.region, '/cognitiveservices/v1'),
      method: 'POST',
      headers: {
        ...azureHeaders(account.apiKey),
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': outputFormatFor(account),
      },
      body: buildAzureSsml(input),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Azure: invalid API key (HTTP ${res.status})`);
    }
    if (res.status === 429) throw new Error('Azure: quota exceeded (HTTP 429)');
    if (res.status !== 200) {
      const detail = res.text ? `: ${res.text.slice(0, 120)}` : '';
      throw new Error(`Azure HTTP ${res.status}${detail}`);
    }
    const data = res.arrayBuffer;
    if (!data || data.byteLength === 0) throw new Error('Azure 返回空音频');
    return { data, mime: 'audio/mpeg' };
  },
};
