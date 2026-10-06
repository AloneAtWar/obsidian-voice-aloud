import { describe, expect, it } from 'vitest';
import type { AudioStorage } from '../src/core/cache/storage';
import { PregenQueue, type PregenQueueDeps, type QueuePersistData } from '../src/core/pregen-queue';
import type { Synthesizer, SynthOutcome } from '../src/core/synth-service';
import type { TtsAccountConfig } from '../src/core/providers/types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(cond: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await delay(5);
  }
}

function mkAccount(id: string, patch: Partial<TtsAccountConfig> = {}): TtsAccountConfig {
  return {
    id,
    name: `acc-${id}`,
    providerId: 'openai-compatible',
    voice: 'v1',
    language: 'Chinese',
    ...patch,
  };
}

/** n 行、每行一句的测试笔记。 */
function noteMd(n: number): string {
  return Array.from({ length: n }, (_, i) => `第${i + 1}句。`).join('\n');
}

interface HarnessOpts {
  accounts?: TtsAccountConfig[];
  notes?: Record<string, string>;
  playbackBehavior?: 'yield' | 'pause';
  playbackActive?: () => boolean;
  localTtsTotal?: number;
  failAll?: boolean;
  /** 前 N 次合成抛错（之后恢复），验证重试。 */
  failFirst?: number;
  delayMs?: number;
  retryDelays?: number[];
}

interface Harness {
  queue: PregenQueue;
  notifications: string[];
  synth: { calls: number; peakParallel: number; stored: Set<string> };
  notes: Map<string, string>;
}

function createHarness(opts: HarnessOpts = {}): Harness {
  const accounts = new Map((opts.accounts ?? [mkAccount('a1')]).map((a) => [a.id, a]));
  const notes = new Map(Object.entries(opts.notes ?? { 'note.md': noteMd(4) }));
  const notifications: string[] = [];
  const st = { calls: 0, peakParallel: 0, stored: new Set<string>() };
  let parallel = 0;
  let idSeq = 0;
  let queueRef: PregenQueue | null = null;

  const keyOf = (accountId: string, voice: string, text: string) =>
    `k:${accountId}:${voice}:${text}`;

  const synth: Synthesizer = {
    keyFor: async (account, voice, text) => keyOf(account.id, voice, text),
    synthesize: async (req): Promise<SynthOutcome> => {
      const key = keyOf(req.account.id, req.voice, req.text);
      if (st.stored.has(key)) {
        return { key, blob: new Blob(['x']), mime: 'audio/mpeg', fromCache: true };
      }
      st.calls++;
      if (opts.failAll) throw new Error('endpoint down');
      if (opts.failFirst && st.calls <= opts.failFirst) throw new Error('flaky');
      parallel++;
      st.peakParallel = Math.max(st.peakParallel, parallel);
      try {
        await delay(opts.delayMs ?? 1);
        st.stored.add(key);
        return { key, blob: new Blob(['x']), mime: 'audio/mpeg', fromCache: false };
      } finally {
        parallel--;
      }
    },
  };

  const storage = {
    hasMany: async (keys: string[]) => new Set(keys.filter((k) => st.stored.has(k))),
  } as unknown as AudioStorage;

  const deps: PregenQueueDeps = {
    storage,
    synth,
    getAccount: (id) => accounts.get(id),
    canPregenerate: () => true,
    readNote: async (path) => notes.get(path) ?? null,
    getConcurrencySettings: () => ({
      localTtsTotal: opts.localTtsTotal ?? 8,
      playbackBehavior: opts.playbackBehavior ?? 'yield',
    }),
    isPlaybackActive: () => opts.playbackActive?.() ?? false,
    notify: (message) => notifications.push(message),
    persist: () => void queueRef,
    newId: () => `task-${++idSeq}`,
    retryDelays: opts.retryDelays ?? [0, 0],
  };

  const queue = new PregenQueue(deps);
  queueRef = queue;
  return { queue, notifications, synth: st, notes };
}

function taskOf(h: Harness, notePath: string) {
  const task = h.queue.snapshot().tasks.find((t) => t.notePath === notePath);
  if (!task) throw new Error(`task not found: ${notePath}`);
  return task;
}

describe('PregenQueue 入队与身份', () => {
  it('笔记+账号+音色 去重；换音色是独立任务', async () => {
    const h = createHarness({ delayMs: 30, notes: { 'n.md': noteMd(10) } });
    expect(h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1')).toBe('added');
    expect(h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1')).toBe('duplicate');
    expect(h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v2', 'acc-a1')).toBe('added');
    expect(h.queue.snapshot().tasks).toHaveLength(2);
    h.queue.dispose();
  });

  it('已终结的同身份任务被再次入队替换（增量刷新语义）', async () => {
    const h = createHarness({ notes: { 'n.md': noteMd(3) } });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    const tasks = h.queue.snapshot().tasks.filter((t) => t.notePath === 'n.md');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('waiting');
    h.queue.dispose();
  });
});

describe('PregenQueue 生成', () => {
  it('增量：已缓存句跳过，只合成缺失句', async () => {
    const h = createHarness({ notes: { 'n.md': noteMd(4) } });
    // 预置前两句的缓存（与假 synth 的 key 规则一致）
    h.synth.stored.add('k:a1:v1:第1句。');
    h.synth.stored.add('k:a1:v1:第2句。');
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    const task = taskOf(h, 'n.md');
    expect(task.done).toBe(4);
    expect(task.total).toBe(4);
    expect(h.synth.calls).toBe(2);
    h.queue.dispose();
  });

  it('全部命中缓存 → 立即完成并提示 0 句需生成', async () => {
    const h = createHarness({ notes: { 'n.md': noteMd(2) } });
    h.synth.stored.add('k:a1:v1:第1句。');
    h.synth.stored.add('k:a1:v1:第2句。');
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    expect(h.synth.calls).toBe(0);
    expect(h.notifications.some((m) => m.includes('0 句需生成'))).toBe(true);
    h.queue.dispose();
  });

  it('瞬时故障经重试后成功', async () => {
    const h = createHarness({ failFirst: 1, retryDelays: [1], notes: { 'n.md': noteMd(2) } });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    expect(h.synth.calls).toBe(3); // 2 句 + 1 次重试
    expect(taskOf(h, 'n.md').failed).toBe(0);
    h.queue.dispose();
  });
});

describe('PregenQueue 失败保护', () => {
  it('连续 10 句失败自动暂停；重启后跑完并标记部分失败', async () => {
    const h = createHarness({ failAll: true, notes: { 'n.md': noteMd(12) } });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => h.queue.snapshot().pauseReason === 'failures');
    const paused = h.queue.snapshot();
    expect(paused.running).toBe(false);
    expect(taskOf(h, 'n.md').failed).toBe(10);
    expect(taskOf(h, 'n.md').status).toBe('waiting'); // 暂停中回等待态
    expect(h.notifications.some((m) => m.includes('自动暂停'))).toBe(true);

    // 端点持续故障：每次重启重试 10 句后再次自动暂停，直到 12 句全部试完
    for (let i = 0; i < 4 && taskOf(h, 'n.md').status !== 'partial'; i++) {
      h.queue.start();
      await waitFor(
        () =>
          taskOf(h, 'n.md').status === 'partial' || h.queue.snapshot().pauseReason === 'failures',
      );
    }
    expect(taskOf(h, 'n.md').status).toBe('partial');
    expect(taskOf(h, 'n.md').failed).toBe(12);
    expect(taskOf(h, 'n.md').done).toBe(0);
    h.queue.dispose();
  });
});

describe('PregenQueue 并发', () => {
  it('账号最大并发 2：并行发生且不超过 2', async () => {
    const h = createHarness({
      accounts: [mkAccount('a1', { maxConcurrency: 2 })],
      delayMs: 15,
      notes: { 'n.md': noteMd(8) },
    });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    expect(h.synth.peakParallel).toBe(2);
    h.queue.dispose();
  });

  it('本地 TTS 全局总并发约束跨账号生效', async () => {
    const h = createHarness({
      accounts: [
        mkAccount('a1', { isLocalTts: true, maxConcurrency: 2 }),
        mkAccount('a2', { isLocalTts: true, maxConcurrency: 2 }),
      ],
      localTtsTotal: 1,
      delayMs: 10,
      notes: { 'a.md': noteMd(4), 'b.md': noteMd(4) },
    });
    h.queue.enqueue({ path: 'a.md', title: 'a' }, 'a1', 'v1', 'acc-a1');
    h.queue.enqueue({ path: 'b.md', title: 'b' }, 'a2', 'v1', 'acc-a2');
    await waitFor(() => h.queue.snapshot().tasks.every((t) => t.status === 'done'));
    expect(h.synth.peakParallel).toBe(1);
    h.queue.dispose();
  });
});

describe('PregenQueue 播放协调', () => {
  it("'pause' 行为：播放期间不派发，播放结束后续跑", async () => {
    let playing = true;
    const h = createHarness({
      playbackBehavior: 'pause',
      playbackActive: () => playing,
      delayMs: 5,
      notes: { 'n.md': noteMd(3) },
    });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await delay(60);
    expect(h.synth.calls).toBe(0);
    expect(taskOf(h, 'n.md').status).toBe('waiting');
    playing = false;
    h.queue.notifyPlaybackChanged();
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    expect(h.synth.calls).toBe(3);
    h.queue.dispose();
  });

  it('暂停后任务回等待态，恢复后继续并完成', async () => {
    const h = createHarness({ delayMs: 20, notes: { 'n.md': noteMd(6) } });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    await waitFor(() => taskOf(h, 'n.md').done >= 1);
    const doneBefore = taskOf(h, 'n.md').done;
    h.queue.pause();
    expect(h.queue.snapshot().running).toBe(false);
    expect(taskOf(h, 'n.md').status).toBe('waiting');
    h.queue.start();
    await waitFor(() => taskOf(h, 'n.md').status === 'done');
    expect(taskOf(h, 'n.md').done).toBe(6);
    expect(doneBefore).toBeLessThan(6);
    h.queue.dispose();
  });
});

describe('PregenQueue 生命周期与持久化', () => {
  it('笔记删除/账号删除 → 任务过期；改名同步路径', async () => {
    const h = createHarness({ delayMs: 30, notes: { 'n.md': noteMd(10) } });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    h.queue.renameNote('n.md', 'renamed.md', 'renamed');
    expect(taskOf(h, 'renamed.md').noteTitle).toBe('renamed');
    h.queue.removeNote('renamed.md');
    expect(taskOf(h, 'renamed.md').status).toBe('expired');
    h.queue.dispose();
  });

  it('restore：任务保留、运行中任务回到等待态、返回是否在运行', async () => {
    const h1 = createHarness({ delayMs: 30, notes: { 'n.md': noteMd(10) } });
    h1.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    const data: QueuePersistData = h1.queue.persistData();
    expect(data.running).toBe(true);
    h1.queue.dispose();

    const h2 = createHarness({ delayMs: 5, notes: { 'n.md': noteMd(10) } });
    expect(h2.queue.restore(data)).toBe(true);
    expect(h2.queue.snapshot().running).toBe(false); // 宿主按 autoResume 决定 start
    const task = h2.queue.snapshot().tasks[0];
    expect(task.notePath).toBe('n.md');
    expect(task.status).toBe('waiting');
    h2.queue.dispose();
  });

  it('stopAll 取消未完成任务；clearFinished 清空历史', async () => {
    const h = createHarness({ delayMs: 30, notes: { 'n.md': noteMd(10) } });
    h.queue.enqueue({ path: 'n.md', title: 'n' }, 'a1', 'v1', 'acc-a1');
    h.queue.stopAll();
    expect(taskOf(h, 'n.md').status).toBe('cancelled');
    expect(h.queue.snapshot().running).toBe(false);
    h.queue.clearFinished();
    expect(h.queue.snapshot().tasks).toHaveLength(0);
    h.queue.dispose();
  });

  it('promote 置顶调整顺序', async () => {
    const h = createHarness({ delayMs: 30, notes: { 'a.md': noteMd(10), 'b.md': noteMd(10) } });
    h.queue.pause(); // 保持 waiting，便于断言顺序
    h.queue.enqueue({ path: 'a.md', title: 'a' }, 'a1', 'v1', 'acc-a1');
    h.queue.enqueue({ path: 'b.md', title: 'b' }, 'a1', 'v1', 'acc-a1');
    expect(h.queue.snapshot().tasks.map((t) => t.notePath)).toEqual(['a.md', 'b.md']);
    h.queue.promote(taskOf(h, 'b.md').id);
    expect(h.queue.snapshot().tasks.map((t) => t.notePath)).toEqual(['b.md', 'a.md']);
    h.queue.dispose();
  });
});
