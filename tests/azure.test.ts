import { describe, expect, it } from 'vitest';
import {
  AZURE_DEFAULT_OUTPUT_FORMAT,
  AZURE_FALLBACK_VOICES,
  AZURE_OUTPUT_FORMATS,
  azureHeaders,
  azureProvider,
  azureUrl,
  buildAzureSsml,
  escapeXml,
  localeFromVoice,
  normalizeRegion,
  outputFormatFor,
  parseAzureVoices,
  supportsLanguageTag,
} from '../src/core/providers/azure';
import { PROVIDERS, getProvider } from '../src/core/providers/registry';
import { audioCacheKey, canonicalExtra } from '../src/core/cache/key';
import type { HttpFn, HttpResponse, TtsAccountConfig } from '../src/core/providers/types';

const account = (patch: Partial<TtsAccountConfig>): TtsAccountConfig => ({
  id: 'a1',
  name: 'test',
  providerId: 'azure-tts',
  voice: 'zh-CN-XiaoxiaoNeural',
  language: 'Chinese',
  region: 'eastus',
  ...patch,
});

/** 记录请求并按脚本返回响应的假 HTTP。 */
function fakeHttp(handler: (req: { url: string; method: string; headers?: Record<string, string>; body?: string }) => HttpResponse) {
  const seen: Parameters<typeof handler>[0][] = [];
  const http: HttpFn = async (req) => {
    seen.push(req);
    return handler(req);
  };
  return { http, seen };
}

const okAudio: HttpResponse = {
  status: 200,
  arrayBuffer: new TextEncoder().encode('mp3').buffer,
};

describe('azure 区域与 URL', () => {
  it('normalizeRegion 接受简写、大小写与完整 URL', () => {
    expect(normalizeRegion('eastus')).toBe('eastus');
    expect(normalizeRegion('EastUS')).toBe('eastus');
    expect(normalizeRegion('https://eastasia.tts.speech.microsoft.com/')).toBe('eastasia');
    expect(normalizeRegion('https://southeastasia.tts.speech.microsoft.com')).toBe(
      'southeastasia',
    );
    expect(normalizeRegion('')).toBe('eastus');
    expect(normalizeRegion(undefined)).toBe('eastus');
  });

  it('azureUrl 拼接区域端点', () => {
    expect(azureUrl('eastus', '/cognitiveservices/v1')).toBe(
      'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
    );
  });

  it('azureHeaders 使用 Ocp-Apim-Subscription-Key', () => {
    expect(azureHeaders(' k ')).toEqual({ 'Ocp-Apim-Subscription-Key': 'k' });
  });
});

describe('azure SSML', () => {
  it('escapeXml 转义特殊字符', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('localeFromVoice 从音色名推导 locale', () => {
    expect(localeFromVoice('zh-CN-XiaoxiaoNeural')).toBe('zh-CN');
    expect(localeFromVoice('en-US-AvaMultilingualNeural')).toBe('en-US');
    expect(localeFromVoice('ja_JP-NanamiNeural')).toBe('ja-JP');
    expect(localeFromVoice('garbage')).toBe('zh-CN');
  });

  it('buildAzureSsml 生成合法 SSML 并转义文本', () => {
    expect(buildAzureSsml({ text: '你好 & <世界>', voice: 'zh-CN-XiaoxiaoNeural', language: 'Chinese' })).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">' +
        '<voice name="zh-CN-XiaoxiaoNeural">你好 &amp; &lt;世界&gt;</voice></speak>',
    );
  });

  it('parseAzureVoices 提取 ShortName 并过滤脏数据', () => {
    expect(parseAzureVoices([{ ShortName: 'zh-CN-A' }, { ShortName: 'en-US-B' }, { ShortName: '' }, 42])).toEqual([
      'zh-CN-A',
      'en-US-B',
    ]);
    expect(parseAzureVoices({ not: 'array' })).toEqual([]);
  });
});

describe('azure provider 形状与注册', () => {
  it('注册表中可查到且能力正确', () => {
    const p = getProvider('azure-tts');
    expect(p).toBe(azureProvider);
    expect(p?.capabilities).toEqual({
      cacheable: true,
      pregeneratable: true,
      voiceList: true,
      direct: false,
    });
    expect(PROVIDERS['azure-tts']).toBe(azureProvider);
  });

  it('defaults 默认 eastus 与多语言中文音色（支持中英混读）', () => {
    expect(azureProvider.defaults()).toEqual({
      region: 'eastus',
      voice: 'zh-CN-XiaoxiaoMultilingualNeural',
      language: 'Chinese',
    });
    // 默认音色必须自带语言域能力，否则 50 percent 会读成「五十」
    expect(supportsLanguageTag(azureProvider.defaults().voice as string)).toBe(true);
  });

  it('fallback 音色列表非空，且第一项就是默认音色', () => {
    expect(AZURE_FALLBACK_VOICES.length).toBeGreaterThan(0);
    expect(AZURE_FALLBACK_VOICES.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(AZURE_FALLBACK_VOICES[0]).toBe(azureProvider.defaults().voice);
  });
});

describe('azure synthesize', () => {
  it('POST SSML 到区域端点并返回 MP3', async () => {
    const { http, seen } = fakeHttp(() => okAudio);
    const r = await azureProvider.synthesize(
      account({ apiKey: 'secret' }),
      { text: '你好&再见', voice: 'zh-CN-XiaoxiaoNeural', language: 'Chinese' },
      http,
    );
    expect(r.mime).toBe('audio/mpeg');
    expect(r.data.byteLength).toBe(3);
    const req = seen[0];
    expect(req.url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(req.method).toBe('POST');
    expect(req.headers?.['Ocp-Apim-Subscription-Key']).toBe('secret');
    expect(req.headers?.['Content-Type']).toBe('application/ssml+xml');
    expect(req.headers?.['X-Microsoft-OutputFormat']).toBe('audio-48khz-192kbitrate-mono-mp3');
    expect(req.body).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">' +
        '<voice name="zh-CN-XiaoxiaoNeural">你好&amp;再见</voice></speak>',
    );
  });

  it('完整 URL 形态的区域也能正确取用', async () => {
    const { http, seen } = fakeHttp(() => okAudio);
    await azureProvider.synthesize(
      account({ apiKey: 'k', region: 'https://westus2.tts.speech.microsoft.com' }),
      { text: 't', voice: 'en-US-JennyNeural', language: 'English' },
      http,
    );
    expect(seen[0].url).toBe('https://westus2.tts.speech.microsoft.com/cognitiveservices/v1');
  });

  it('缺少 apiKey / region 抛错', async () => {
    const { http } = fakeHttp(() => okAudio);
    await expect(
      azureProvider.synthesize(account({ apiKey: undefined }), { text: 't', voice: 'v', language: 'Chinese' }, http),
    ).rejects.toThrow('missing API key');
    await expect(
      azureProvider.synthesize(account({ apiKey: 'k', region: undefined }), { text: 't', voice: 'v', language: 'Chinese' }, http),
    ).rejects.toThrow('missing region');
  });

  it('401/403 提示密钥无效，429 提示配额，空音频抛错', async () => {
    const http401: HttpFn = async () => ({ status: 401, text: 'nope' });
    await expect(
      azureProvider.synthesize(account({ apiKey: 'bad' }), { text: 't', voice: 'v', language: 'Chinese' }, http401),
    ).rejects.toThrow('invalid API key');
    const http429: HttpFn = async () => ({ status: 429 });
    await expect(
      azureProvider.synthesize(account({ apiKey: 'k' }), { text: 't', voice: 'v', language: 'Chinese' }, http429),
    ).rejects.toThrow('quota');
    const httpEmpty: HttpFn = async () => ({ status: 200, arrayBuffer: new ArrayBuffer(0) });
    await expect(
      azureProvider.synthesize(account({ apiKey: 'k' }), { text: 't', voice: 'v', language: 'Chinese' }, httpEmpty),
    ).rejects.toThrow('返回空音频');
  });
});

describe('azure listVoices / checkHealth', () => {
  it('listVoices 拉取并解析音色列表', async () => {
    const { http, seen } = fakeHttp(() => ({
      status: 200,
      json: [{ ShortName: 'zh-CN-TestA' }, { ShortName: 'en-US-TestB' }],
    }));
    const voices = await azureProvider.listVoices(account({ apiKey: 'k' }), http);
    expect(voices).toEqual(['zh-CN-TestA', 'en-US-TestB']);
    expect(seen[0].url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/voices/list');
    expect(seen[0].headers?.['Ocp-Apim-Subscription-Key']).toBe('k');
  });

  it('未配置区域时回退内置音色', async () => {
    const { http } = fakeHttp(() => ({ status: 500 }));
    expect(await azureProvider.listVoices(account({ region: undefined }), http)).toBe(
      AZURE_FALLBACK_VOICES,
    );
  });

  it('checkHealth 校验 key 与 region', async () => {
    const { http } = fakeHttp(() => ({ status: 200, json: [] }));
    expect(await azureProvider.checkHealth!(account({ apiKey: 'k' }), http)).toEqual({ ok: true });
    const noKey = await azureProvider.checkHealth!(account({ apiKey: undefined }), http);
    expect(noKey.ok).toBe(false);
    expect(noKey.message).toMatch(/key/);
    const noRegion = await azureProvider.checkHealth!(account({ apiKey: 'k', region: undefined }), http);
    expect(noRegion.ok).toBe(false);
    expect(noRegion.message).toMatch(/region/);
  });

  it('checkHealth 401 提示密钥无效', async () => {
    const http401: HttpFn = async () => ({ status: 401 });
    const r = await azureProvider.checkHealth!(account({ apiKey: 'bad' }), http401);
    expect(r).toEqual({ ok: false, message: 'Azure: invalid API key (HTTP 401)' });
  });
});

describe('azure SSML 中英混排语言域', () => {
  const build = (text: string, voice: string) =>
    buildAzureSsml({ text, voice, language: 'Chinese' });

  const EN =
    'Given the current divorce rate of nearly 50 percent, that amounts to millions of cases in the United States every year.';

  it('中文多语言音色 + 中文标签 + 英文长句：英文整段进 en-US，数字随之读 fifty', () => {
    expect(build(`例句：${EN}`, 'zh-CN-XiaoxiaoMultilingualNeural')).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">' +
        `<voice name="zh-CN-XiaoxiaoMultilingualNeural">例句：<lang xml:lang="en-US">${EN}</lang></voice></speak>`,
    );
  });

  it('HD 音色（冒号形式）同样按 zh-CN 推导 locale 并套语言域', () => {
    const s = build(`例句：${EN}`, 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural');
    expect(s).toContain('xml:lang="zh-CN"');
    expect(s).toContain(`<lang xml:lang="en-US">${EN}</lang>`);
  });

  it('英文多语言音色 + 中文片段：中文进 zh-CN', () => {
    expect(build('Hello 世界', 'en-US-AvaMultilingualNeural')).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">' +
        '<voice name="en-US-AvaMultilingualNeural">Hello <lang xml:lang="zh-CN">世界</lang></voice></speak>',
    );
  });

  it('普通音色不生成 lang 标签（官方仅多语言音色支持该元素）', () => {
    // 普通音色 zh-CN-XiaoxiaoNeural：整段保持纯文本，只做 XML 转义
    expect(build(`例句：${EN}`, 'zh-CN-XiaoxiaoNeural')).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">' +
        `<voice name="zh-CN-XiaoxiaoNeural">例句：${EN}</voice></speak>`,
    );
    // 普通英文音色同理：不给中文片段套语言域
    expect(build('Hello 世界', 'en-US-JennyNeural')).not.toContain('<lang');
  });

  it('supportsLanguageTag：多语言 / HD 支持，普通音色不支持', () => {
    expect(supportsLanguageTag('zh-CN-XiaoxiaoMultilingualNeural')).toBe(true);
    expect(supportsLanguageTag('en-US-AndrewMultilingualNeural')).toBe(true);
    expect(supportsLanguageTag('zh-CN-Xiaoxiao:DragonHDLatestNeural')).toBe(true);
    expect(supportsLanguageTag('zh-CN-XiaoxiaoNeural')).toBe(false);
    expect(supportsLanguageTag('en-US-JennyNeural')).toBe(false);
    expect(supportsLanguageTag('ja-JP-NanamiNeural')).toBe(false);
    expect(supportsLanguageTag('')).toBe(false);
  });

  it('纯中文不产生 lang 标签', () => {
    expect(build('今天的句子很简单。', 'zh-CN-XiaoxiaoMultilingualNeural')).not.toContain('<lang');
  });

  it('数字后接中文时仍按中文读（第 50 名 → 五十）', () => {
    expect(build('第 50 名的考生请注意', 'zh-CN-XiaoxiaoMultilingualNeural')).not.toContain('<lang');
  });

  it('语言域内的文本照常转义，标签本身不被转义', () => {
    const s = build('标题 A & B 结束', 'zh-CN-XiaoxiaoMultilingualNeural');
    expect(s).toContain('<lang xml:lang="en-US">A &amp; B</lang>');
  });

  it('供应商声明了 cacheRevision，旧缓存随之失效', () => {
    expect(azureProvider.cacheRevision).toBeTruthy();
    expect(typeof azureProvider.cacheRevision).toBe('string');
  });
});

describe('azure 输出格式（码率）', () => {
  const fmt = (outputFormat?: string) => {
    const extra = outputFormat ? { outputFormat } : undefined;
    return outputFormatFor(account({ extra }));
  };

  it('默认 48 kHz / 192 kbps；选项按文件大小降序', () => {
    expect(AZURE_DEFAULT_OUTPUT_FORMAT).toBe('audio-48khz-192kbitrate-mono-mp3');
    expect(fmt()).toBe('audio-48khz-192kbitrate-mono-mp3');
    expect([...AZURE_OUTPUT_FORMATS]).toEqual([
      'audio-48khz-192kbitrate-mono-mp3',
      'audio-48khz-96kbitrate-mono-mp3',
      'audio-24khz-48kbitrate-mono-mp3',
    ]);
  });

  it('账号选择生效；非法值回退默认（旧账号无需迁移）', () => {
    expect(fmt('audio-48khz-96kbitrate-mono-mp3')).toBe('audio-48khz-96kbitrate-mono-mp3');
    expect(fmt('audio-24khz-48kbitrate-mono-mp3')).toBe('audio-24khz-48kbitrate-mono-mp3');
    expect(fmt('audio-16khz-32kbitrate-mono-mp3')).toBe('audio-48khz-192kbitrate-mono-mp3');
  });

  it('请求头使用账号选定的格式', async () => {
    const { http, seen } = fakeHttp(() => okAudio);
    await azureProvider.synthesize(
      account({ apiKey: 'k', extra: { outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } }),
      { text: '你好', voice: 'zh-CN-XiaoxiaoNeural', language: 'Chinese' },
      http,
    );
    expect(seen[0].headers?.['X-Microsoft-OutputFormat']).toBe('audio-24khz-48kbitrate-mono-mp3');
  });

  it('切换码率 → extra 变化 → 缓存键变化（自动重新合成）', async () => {
    const a = await audioCacheKey({
      accountId: 'a1',
      providerId: 'azure-tts',
      voice: 'zh-CN-XiaoxiaoNeural',
      language: 'Chinese',
      extra: canonicalExtra({ outputFormat: 'audio-48khz-192kbitrate-mono-mp3' }),
      text: '同一句。',
    });
    const b = await audioCacheKey({
      accountId: 'a1',
      providerId: 'azure-tts',
      voice: 'zh-CN-XiaoxiaoNeural',
      language: 'Chinese',
      extra: canonicalExtra({ outputFormat: 'audio-24khz-48kbitrate-mono-mp3' }),
      text: '同一句。',
    });
    expect(a).not.toBe(b);
  });
});
