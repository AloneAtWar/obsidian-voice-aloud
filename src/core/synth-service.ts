import { getProvider } from './providers/registry';
import type { TtsAccountConfig } from './providers/types';
import { audioCacheKey, canonicalExtra } from './cache/key';
import type { AudioStorage, CacheOwner } from './cache/storage';

export interface SynthRequest {
  account: TtsAccountConfig;
  /** 音色（面板当前选择或任务入队时的快照）；空串回退 account.voice。 */
  voice: string;
  text: string;
  /** 落缓存归属的笔记路径；null 不落缓存。 */
  notePath: string | null;
}

export interface SynthOutcome {
  key: string;
  blob: Blob;
  mime: string;
  fromCache: boolean;
}

/** 合成服务契约：播放器与预生成队列共用（队列依赖此接口以便测试注入假实现）。 */
export interface Synthesizer {
  synthesize(req: SynthRequest): Promise<SynthOutcome>;
  keyFor(account: TtsAccountConfig, voice: string, text: string): Promise<string>;
}

/**
 * 共享合成服务：内存/缓存查询 → 合成 → 落缓存。
 * in-flight 去重：同一 key 的并发请求（播放预取 × 队列 worker）只发一次。
 * 播放侧调用不经队列的并发槽约束（「让路」语义：即时合成优先）。
 */
export class SynthService implements Synthesizer {
  private inflight = new Map<string, Promise<SynthOutcome>>();

  constructor(private storage: AudioStorage) {}

  async keyFor(account: TtsAccountConfig, voice: string, text: string): Promise<string> {
    return audioCacheKey({
      accountId: account.id,
      providerId: account.providerId,
      model: account.model,
      voice: voice || account.voice,
      language: account.language,
      extra: canonicalExtra(account.extra),
      text,
    });
  }

  async synthesize(req: SynthRequest): Promise<SynthOutcome> {
    const provider = getProvider(req.account.providerId);
    if (!provider?.capabilities.cacheable) {
      throw new Error('当前引擎不支持音频缓存');
    }
    const voice = req.voice || req.account.voice;
    const key = await this.keyFor(req.account, voice, req.text);
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.run(req, provider, voice, key);
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async run(
    req: SynthRequest,
    provider: NonNullable<ReturnType<typeof getProvider>>,
    voice: string,
    key: string,
  ): Promise<SynthOutcome> {
    const cached = await this.storage.get(key);
    if (cached) return { key, blob: cached.blob, mime: cached.mime, fromCache: true };
    const result = await provider.synthesize(req.account, {
      text: req.text,
      voice,
      language: req.account.language,
    });
    const blob = new Blob([result.data], { type: result.mime });
    if (req.notePath) {
      const owner: CacheOwner = {
        accountId: req.account.id,
        accountName: req.account.name || req.account.id,
        voice,
      };
      try {
        await this.storage.put(key, blob, result.mime, req.notePath, owner);
      } catch {
        /* 缓存写失败不影响合成结果 */
      }
    }
    return { key, blob, mime: result.mime, fromCache: false };
  }
}
