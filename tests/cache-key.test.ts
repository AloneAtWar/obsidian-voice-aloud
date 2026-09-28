import { describe, expect, it } from 'vitest';
import { audioCacheKey, canonicalExtra } from '../src/core/cache/key';

const base = {
  accountId: 'acct-1',
  providerId: 'qwen3-tts',
  model: undefined as string | undefined,
  voice: 'Serena',
  language: 'Chinese',
  text: '同一句话。',
};

describe('audioCacheKey', () => {
  it('确定性', async () => {
    expect(await audioCacheKey(base)).toBe(await audioCacheKey({ ...base }));
  });

  it('换音色 → 键变', async () => {
    expect(await audioCacheKey(base)).not.toBe(await audioCacheKey({ ...base, voice: 'Vivian' }));
  });

  it('换供应商 → 键变', async () => {
    expect(await audioCacheKey(base)).not.toBe(
      await audioCacheKey({ ...base, providerId: 'openai-compatible' }),
    );
  });

  it('换账号 → 键变', async () => {
    expect(await audioCacheKey(base)).not.toBe(
      await audioCacheKey({ ...base, accountId: 'acct-2' }),
    );
  });

  it('换模型/语言 → 键变', async () => {
    expect(await audioCacheKey(base)).not.toBe(await audioCacheKey({ ...base, model: 'm1' }));
    expect(await audioCacheKey(base)).not.toBe(
      await audioCacheKey({ ...base, language: 'English' }),
    );
  });

  it('换额外参数（如风格指令）→ 键变', async () => {
    expect(await audioCacheKey(base)).not.toBe(
      await audioCacheKey({ ...base, extra: 'style=温柔' }),
    );
  });

  it('canonicalExtra：键排序归一，空对象/undefined 为空', () => {
    expect(canonicalExtra(undefined)).toBeUndefined();
    expect(canonicalExtra({})).toBeUndefined();
    expect(canonicalExtra({ b: '2', a: '1' })).toBe('a=1&b=2');
    expect(canonicalExtra({ a: '1', b: '2' })).toBe('a=1&b=2');
  });

  it('改句子文本 → 键变（缓存失效的核心机制）', async () => {
    expect(await audioCacheKey(base)).not.toBe(
      await audioCacheKey({ ...base, text: '改过的句子。' }),
    );
  });

  it('字段分隔安全：字段值拼接歧义不产生碰撞', async () => {
    const a = await audioCacheKey({ ...base, voice: 'ab', language: 'c' });
    const b = await audioCacheKey({ ...base, voice: 'a', language: 'bc' });
    expect(a).not.toBe(b);
  });
});
