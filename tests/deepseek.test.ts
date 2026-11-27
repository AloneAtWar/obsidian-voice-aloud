import { describe, expect, it } from 'vitest';
import { newAccount } from '../src/core/accounts';
import {
  DEEPSEEK_DEFAULT_BASE,
  DEEPSEEK_VOICES,
  buildDeepseekBody,
  deepseekProvider,
  deepseekTtsEndpoint,
} from '../src/core/providers/deepseek';
import { getProvider } from '../src/core/providers/registry';
import type { HttpFn, TtsAccountConfig } from '../src/core/providers/types';

const account = (patch: Partial<TtsAccountConfig> = {}): TtsAccountConfig => ({
  id: 'a1',
  name: 'deepseek',
  providerId: 'deepseek-tts',
  baseUrl: DEEPSEEK_DEFAULT_BASE,
  apiKey: 'sk-test',
  voice: 'stella',
  language: 'Auto',
  ...patch,
});

const okHttp =
  (seen: unknown[]): HttpFn =>
  async (req) => {
    seen.push(req);
    return {
      status: 200,
      arrayBuffer: new Uint8Array([1, 2, 3, 4]).buffer,
      headers: { 'content-type': 'audio/wav' },
    };
  };

describe('deepseek endpoint 与请求体', () => {
  it('默认地址，并去掉尾部斜杠', () => {
    expect(deepseekTtsEndpoint()).toBe('https://api.deepseek.com/v1/tools/tts');
    expect(deepseekTtsEndpoint('https://api.deepseek.com/')).toBe(
      'https://api.deepseek.com/v1/tools/tts',
    );
    expect(deepseekTtsEndpoint('  ')).toBe('https://api.deepseek.com/v1/tools/tts');
  });

  it('请求体使用 text / voice_id，格式为 wav', () => {
    expect(buildDeepseekBody('你好', 'tide')).toEqual({
      text: '你好',
      voice_id: 'tide',
      format: 'wav',
      filter_markdown: true,
    });
    expect(buildDeepseekBody('你好', '  ')).toMatchObject({ voice_id: 'stella' });
  });
});

describe('deepseekProvider', () => {
  it('已注册，新账号带官方地址和默认音色', () => {
    expect(getProvider('deepseek-tts')).toBe(deepseekProvider);
    const acc = newAccount('deepseek-tts', { name: '笔记' });
    expect(acc.baseUrl).toBe(DEEPSEEK_DEFAULT_BASE);
    expect(acc.voice).toBe('stella');
    expect(acc.language).toBe('Auto');
    expect(acc.name).toBe('笔记');
  });

  it('音色列表固定，并带中文显示名', async () => {
    expect(await deepseekProvider.listVoices(account())).toEqual(['stella', 'tide']);
    expect(deepseekProvider.voiceLabels).toEqual({
      stella: DEEPSEEK_VOICES[0].label,
      tide: DEEPSEEK_VOICES[1].label,
    });
  });

  it('synthesize 带 Bearer，返回 wav', async () => {
    const seen: unknown[] = [];
    const result = await deepseekProvider.synthesize(
      account(),
      { text: '你好', voice: 'tide', language: 'Auto' },
      okHttp(seen),
    );
    expect(result.mime).toBe('audio/wav');
    expect(result.data.byteLength).toBe(4);
    const req = seen[0] as { url: string; headers: Record<string, string>; body: string };
    expect(req.url).toBe('https://api.deepseek.com/v1/tools/tts');
    expect(req.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(req.body)).toEqual({
      text: '你好',
      voice_id: 'tide',
      format: 'wav',
      filter_markdown: true,
    });
  });

  it('服务地址留空时仍打官方端点', async () => {
    const seen: unknown[] = [];
    await deepseekProvider.synthesize(
      account({ baseUrl: '' }),
      { text: '你好', voice: 'stella', language: 'Auto' },
      okHttp(seen),
    );
    expect((seen[0] as { url: string }).url).toBe('https://api.deepseek.com/v1/tools/tts');
  });

  it('没有 API key 或空文本时不发请求', async () => {
    const http: HttpFn = async () => {
      throw new Error('should not send');
    };
    await expect(
      deepseekProvider.synthesize(
        account({ apiKey: '  ' }),
        { text: '你好', voice: 'stella', language: 'Auto' },
        http,
      ),
    ).rejects.toThrow('missing API key');
    await expect(
      deepseekProvider.synthesize(
        account(),
        { text: '  ', voice: 'stella', language: 'Auto' },
        http,
      ),
    ).rejects.toThrow('empty text');
  });

  it('按状态码区分鉴权、并发和内容审核', async () => {
    const http =
      (status: number, text?: string): HttpFn =>
      async () => ({ status, text });
    await expect(
      deepseekProvider.synthesize(
        account(),
        { text: '你好', voice: 'stella', language: 'Auto' },
        http(401),
      ),
    ).rejects.toThrow('invalid API key');
    await expect(
      deepseekProvider.synthesize(
        account(),
        { text: '你好', voice: 'stella', language: 'Auto' },
        http(429),
      ),
    ).rejects.toThrow('too many requests');
    await expect(
      deepseekProvider.synthesize(
        account(),
        { text: '你好', voice: 'stella', language: 'Auto' },
        http(400, 'Content Exists Risk'),
      ),
    ).rejects.toThrow('Content Exists Risk');
    await expect(
      deepseekProvider.synthesize(
        account(),
        { text: '你好', voice: 'stella', language: 'Auto' },
        http(200),
      ),
    ).rejects.toThrow('空音频');
  });

  it('测试连接缺 key 时不发请求，成功时合成一句你好', async () => {
    expect((await deepseekProvider.checkHealth!(account({ apiKey: '' }), okHttp([]))).ok).toBe(
      false,
    );
    const seen: unknown[] = [];
    expect((await deepseekProvider.checkHealth!(account(), okHttp(seen))).ok).toBe(true);
    expect(JSON.parse((seen[0] as { body: string }).body).text).toBe('你好');
    const http401: HttpFn = async () => ({ status: 401 });
    const failed = await deepseekProvider.checkHealth!(account(), http401);
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/invalid API key/);
  });
});
