import { describe, expect, it } from 'vitest';
import { openaiCompatibleProvider, speechEndpoint } from '../src/core/providers/openai-compatible';
import {
  buildQwen3Body,
  parseVoicesResponse,
  qwen3Provider,
  voicesEndpoint,
} from '../src/core/providers/qwen3';
import { webspeechProvider } from '../src/core/providers/webspeech';
import { PROVIDERS, getProvider } from '../src/core/providers/registry';
import { resolveActive, DEFAULT_SETTINGS, newAccount } from '../src/core/accounts';
import type { HttpFn, TtsAccountConfig } from '../src/core/providers/types';

const account = (patch: Partial<TtsAccountConfig>): TtsAccountConfig => ({
  id: 'a1',
  name: 'test',
  providerId: 'qwen3-tts',
  voice: 'Serena',
  language: 'Chinese',
  ...patch,
});

describe('openai-compatible', () => {
  it('speechEndpoint 拼接与去斜杠', () => {
    expect(speechEndpoint('http://h:1//')).toBe('http://h:1/v1/audio/speech');
  });

  it('synthesize 构造请求并返回音频', async () => {
    const seen: unknown[] = [];
    const http: HttpFn = async (req) => {
      seen.push(req);
      return {
        status: 200,
        arrayBuffer: new TextEncoder().encode('mp3').buffer,
        headers: { 'content-type': 'audio/mpeg' },
      };
    };
    const acc = account({
      providerId: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8880',
      apiKey: 'k',
      model: 'tts-1',
    });
    const r = await openaiCompatibleProvider.synthesize(
      acc,
      { text: '你好', voice: 'alloy', language: 'Chinese' },
      http,
    );
    expect(r.mime).toBe('audio/mpeg');
    const req = seen[0] as { url: string; headers: Record<string, string>; body: string };
    expect(req.url).toBe('http://127.0.0.1:8880/v1/audio/speech');
    expect(req.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(req.body)).toEqual({ input: '你好', voice: 'alloy', model: 'tts-1' });
  });

  it('无 apiKey 时不带 Authorization', async () => {
    const seen: unknown[] = [];
    const http: HttpFn = async (req) => {
      seen.push(req);
      return { status: 200, arrayBuffer: new ArrayBuffer(2) };
    };
    const acc = account({ providerId: 'openai-compatible', baseUrl: 'http://x' });
    await openaiCompatibleProvider.synthesize(
      acc,
      { text: 't', voice: 'v', language: 'Chinese' },
      http,
    );
    expect(
      (seen[0] as { headers?: Record<string, string> }).headers?.Authorization,
    ).toBeUndefined();
  });

  it('非 200 / 空响应抛错', async () => {
    const http500: HttpFn = async () => ({ status: 500, text: 'boom' });
    await expect(
      openaiCompatibleProvider.synthesize(
        account({ providerId: 'openai-compatible', baseUrl: 'http://x' }),
        { text: 't', voice: 'v', language: 'Chinese' },
        http500,
      ),
    ).rejects.toThrow('500');
    const httpEmpty: HttpFn = async () => ({ status: 200 });
    await expect(
      openaiCompatibleProvider.synthesize(
        account({ providerId: 'openai-compatible', baseUrl: 'http://x' }),
        { text: 't', voice: 'v', language: 'Chinese' },
        httpEmpty,
      ),
    ).rejects.toThrow('空');
  });
});

describe('qwen3', () => {
  it('请求体带 language，可选 model', () => {
    expect(buildQwen3Body({ text: 't', voice: 'v', language: 'Chinese' })).toEqual({
      input: 't',
      voice: 'v',
      language: 'Chinese',
    });
    expect(
      buildQwen3Body({ text: 't', voice: 'v', language: 'English' }, 'qwen3-tts'),
    ).toMatchObject({
      model: 'qwen3-tts',
    });
  });

  it('音色列表解析（对象键）', () => {
    expect(parseVoicesResponse({ Serena: {}, Vivian: {} })).toEqual(['Serena', 'Vivian']);
    expect(parseVoicesResponse([])).toEqual([]);
    expect(parseVoicesResponse(null)).toEqual([]);
  });

  it('listVoices 走 /api/voices，失败回退内置列表', async () => {
    const http: HttpFn = async (req) => {
      expect(req.url).toBe(voicesEndpoint('http://127.0.0.1:8765'));
      return { status: 200, json: { Serena: {}, Eric: {} } };
    };
    expect(
      await qwen3Provider.listVoices(account({ baseUrl: 'http://127.0.0.1:8765' }), http),
    ).toEqual(['Serena', 'Eric']);

    const httpDead: HttpFn = async () => {
      throw new Error('offline');
    };
    const fallback = await qwen3Provider.listVoices(account({ baseUrl: 'http://x' }), httpDead);
    expect(fallback.length).toBeGreaterThan(3);
  });

  it('checkHealth 读 /health 的 ready 字段', async () => {
    const ok: HttpFn = async () => ({ status: 200, json: { ready: true } });
    expect((await qwen3Provider.checkHealth!(account({ baseUrl: 'http://x' }), ok)).ok).toBe(true);
    const notReady: HttpFn = async () => ({ status: 200, json: { ready: false } });
    expect((await qwen3Provider.checkHealth!(account({ baseUrl: 'http://x' }), notReady)).ok).toBe(
      false,
    );
  });

  it('synthesize 返回 WAV mime', async () => {
    const http: HttpFn = async () => ({ status: 200, arrayBuffer: new ArrayBuffer(4) });
    const r = await qwen3Provider.synthesize(
      account({ baseUrl: 'http://x' }),
      { text: 't', voice: 'v', language: 'Chinese' },
      http,
    );
    expect(r.mime).toBe('audio/wav');
  });
});

describe('webspeech', () => {
  it('能力声明：不可缓存/不可预生成/direct', () => {
    expect(webspeechProvider.capabilities).toEqual({
      cacheable: false,
      pregeneratable: false,
      voiceList: false,
      direct: true,
    });
  });

  it('synthesize 明确抛错', async () => {
    await expect(
      webspeechProvider.synthesize(account({ providerId: 'webspeech' }), {
        text: 't',
        voice: '',
        language: 'Chinese',
      }),
    ).rejects.toThrow();
  });
});

describe('registry & accounts', () => {
  it('所有 provider 都已注册', () => {
    for (const id of ['qwen3-tts', 'openai-compatible', 'mimo', 'webspeech']) {
      expect(getProvider(id)?.id).toBe(id);
    }
    expect(PROVIDERS['nope']).toBeUndefined();
  });

  it('默认设置回退系统语音', () => {
    expect(resolveActive(DEFAULT_SETTINGS).provider.id).toBe('webspeech');
  });

  it('activeAccountId 无效时回退系统语音', () => {
    const s = { ...DEFAULT_SETTINGS, activeAccountId: 'ghost', accounts: [account({ id: 'a1' })] };
    expect(resolveActive(s).provider.id).toBe('webspeech');
  });

  it('解析当前账号', () => {
    const acc = account({ id: 'a1', providerId: 'mimo' });
    const s = { ...DEFAULT_SETTINGS, activeAccountId: 'a1', accounts: [acc] };
    const r = resolveActive(s);
    expect(r.provider.id).toBe('mimo');
    expect(r.account?.id).toBe('a1');
  });

  it('面板选择的音色覆盖账号默认音色', () => {
    const acc = account({ id: 'a1', providerId: 'qwen3-tts', voice: 'Serena' });
    const s = {
      ...DEFAULT_SETTINGS,
      activeAccountId: 'a1',
      accounts: [acc],
      voiceByAccount: { a1: 'Vivian' },
    };
    expect(resolveActive(s).account?.voice).toBe('Vivian');
    const s2 = { ...DEFAULT_SETTINGS, activeAccountId: 'a1', accounts: [acc] };
    expect(resolveActive(s2).account?.voice).toBe('Serena');
  });

  it('newAccount 应用供应商默认值', () => {
    const acc = newAccount('qwen3-tts', { name: '本地' });
    expect(acc.baseUrl).toBe('http://127.0.0.1:8765');
    expect(acc.voice).toBe('Serena');
    expect(acc.name).toBe('本地');
    expect(acc.id).toMatch(/^acct-/);
  });
});
