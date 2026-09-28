import { describe, expect, it } from 'vitest';
import {
  MIMO_DEFAULT_HOST,
  MIMO_MODEL,
  base64ToBytes,
  buildMimoMessages,
  bytesToArrayBuffer,
  extractMimoAudio,
  mimoEndpoint,
} from '../src/core/providers/mimo-audio';
import { mimoProvider } from '../src/core/providers/mimo';
import type { HttpFn } from '../src/core/providers/types';

describe('buildMimoMessages', () => {
  it('无风格：只有 assistant 正文', () => {
    expect(buildMimoMessages('正文')).toEqual([{ role: 'assistant', content: '正文' }]);
  });

  it('有风格：风格作 user（不被读出），正文作 assistant', () => {
    expect(buildMimoMessages('正文', ' 温柔 ')).toEqual([
      { role: 'user', content: '温柔' },
      { role: 'assistant', content: '正文' },
    ]);
  });
});

describe('mimoEndpoint', () => {
  it('默认 host + 路径', () => {
    expect(mimoEndpoint('')).toBe(`https://${MIMO_DEFAULT_HOST}/v1/chat/completions`);
  });

  it('容忍尾斜杠，不重复加协议', () => {
    expect(mimoEndpoint('host.example.com/')).toBe('https://host.example.com/v1/chat/completions');
  });
});

describe('base64ToBytes / bytesToArrayBuffer', () => {
  it('往返一致', () => {
    const bytes = base64ToBytes(btoa('hello mimo'));
    expect(new TextDecoder().decode(bytes)).toBe('hello mimo');
    const ab = bytesToArrayBuffer(bytes);
    expect(ab.byteLength).toBe(10);
    expect(new Uint8Array(ab)).toEqual(bytes);
  });

  it('容忍 data-URL 前缀与空白', () => {
    const bytes = base64ToBytes('data:audio/mp3;base64, ' + btoa('x'));
    expect(bytes.byteLength).toBe(1);
  });

  it('空输入抛错', () => {
    expect(() => base64ToBytes('')).toThrow();
    expect(() => base64ToBytes('!!!')).toThrow();
  });
});

describe('extractMimoAudio', () => {
  const okResp = {
    choices: [{ message: { audio: { data: btoa('abc'), format: 'mp3' } } }],
  };

  it('正常解码', () => {
    const r = extractMimoAudio(okResp);
    expect(r.ok).toBe(true);
    if (r.ok) expect(new TextDecoder().decode(r.bytes)).toBe('abc');
  });

  it('API 错误对象/字符串', () => {
    expect(extractMimoAudio({ error: { message: 'boom' } })).toEqual({ ok: false, error: 'boom' });
    expect(extractMimoAudio({ error: 'plain' })).toEqual({ ok: false, error: 'plain' });
  });

  it('内容过滤 / 缺音频 / 坏 base64', () => {
    expect(extractMimoAudio({ choices: [{ finish_reason: 'content_filter' }] })).toEqual({
      ok: false,
      error: 'MiMo blocked the text (content filter).',
    });
    expect(extractMimoAudio({ choices: [{}] })).toEqual({
      ok: false,
      error: 'MiMo returned no audio.',
    });
    expect(extractMimoAudio({ choices: [{ message: { audio: { data: '@@@' } } }] })).toMatchObject({
      ok: false,
    });
  });
});

describe('mimoProvider.synthesize', () => {
  const account = {
    id: 'a1',
    name: 'test',
    providerId: 'mimo',
    baseUrl: 'api.xiaomimimo.com',
    apiKey: 'sk-test',
    voice: 'mimo_default',
    language: 'Chinese',
    extra: { style: '温柔' },
  };

  it('构造正确的请求并解码响应音频', async () => {
    const seen: unknown[] = [];
    const http: HttpFn = async (req) => {
      seen.push(req);
      return {
        status: 200,
        json: { choices: [{ message: { audio: { data: btoa('audio-bytes') } } }] },
      };
    };
    const result = await mimoProvider.synthesize(
      account,
      { text: '你好', voice: 'mimo_default', language: 'Chinese' },
      http,
    );
    expect(new TextDecoder().decode(new Uint8Array(result.data))).toBe('audio-bytes');
    expect(result.mime).toBe('audio/mpeg');

    const req = seen[0] as { url: string; headers: Record<string, string>; body: string };
    expect(req.url).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    expect(req.headers['api-key']).toBe('sk-test');
    expect(req.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(req.body);
    expect(body.model).toBe(MIMO_MODEL);
    expect(body.audio).toEqual({ format: 'mp3', voice: 'mimo_default' });
    expect(body.messages).toEqual([
      { role: 'user', content: '温柔' },
      { role: 'assistant', content: '你好' },
    ]);
  });

  it('401/429 给出明确错误', async () => {
    const http401: HttpFn = async () => ({ status: 401, json: {} });
    await expect(
      mimoProvider.synthesize(account, { text: 'x', voice: 'v', language: 'Chinese' }, http401),
    ).rejects.toThrow('401');
    const http429: HttpFn = async () => ({ status: 429, json: {} });
    await expect(
      mimoProvider.synthesize(account, { text: 'x', voice: 'v', language: 'Chinese' }, http429),
    ).rejects.toThrow('429');
  });

  it('≥400 带上 API 错误详情', async () => {
    const http500: HttpFn = async () => ({
      status: 500,
      json: { error: { message: 'server boom' } },
    });
    await expect(
      mimoProvider.synthesize(account, { text: 'x', voice: 'v', language: 'Chinese' }, http500),
    ).rejects.toThrow('server boom');
  });
});
