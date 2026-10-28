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

  it('请求体版本：声明后键变，未声明时键与其他供应商保持一致', async () => {
    const withRev = await audioCacheKey({ ...base, synthesisRevision: 'lang-spans-v1' });
    const other = await audioCacheKey({ ...base, synthesisRevision: 'lang-spans-v2' });
    expect(withRev).not.toBe(await audioCacheKey(base));
    expect(withRev).not.toBe(other);
  });

  it('区域：有值时键变，无值时不影响', async () => {
    expect(await audioCacheKey({ ...base, region: 'eastus' })).not.toBe(
      await audioCacheKey({ ...base, region: 'westus2' }),
    );
    expect(await audioCacheKey({ ...base, region: undefined })).toBe(await audioCacheKey(base));
    expect(await audioCacheKey({ ...base, region: '' })).toBe(await audioCacheKey(base));
  });

  // 回归：1.0.3 的字段序列（无 region / 无版本）必须逐字节复现，
  // 否则 OpenAI / Qwen / MiMo 的既有缓存与离线预生成内容会在升级后全部失效。
  it('1.0.3 兼容：固定旧键不随新增字段漂移', async () => {
    expect(await audioCacheKey(base)).toBe(
      '53a0c813f6a358d615fda36550b04d8a7bb6fd887434b31485291273fc741779',
    );
    // 带 model 与 extra 的完整序列（锁定中间字段顺序：model 在 voice 之前，extra 在 text 之前）
    expect(
      await audioCacheKey({
        accountId: 'acct-1',
        providerId: 'openai-compatible',
        model: 'tts-1',
        voice: 'alloy',
        language: 'English',
        extra: canonicalExtra({ b: '2', a: '1' }),
        text: 'Hello.',
      }),
    ).toBe('f17e49ee896565cbb189fc8d8213f18a85451d6548c8a981f4cb1f0942cb78df');
  });
});
