import { t } from '../i18n';
import type { AudioStorage } from './cache/storage';
import { buildUnits } from './sentences';
import type { Synthesizer, SynthOutcome } from './synth-service';
import type { TtsAccountConfig } from './providers/types';

export type QueueTaskStatus = 'waiting' | 'running' | 'done' | 'partial' | 'cancelled' | 'expired';

/** 任务 = 笔记 × 账号 × 音色（与缓存 key 维度对齐）；音色为入队时快照。 */
export interface QueueTask {
  id: string;
  notePath: string;
  noteTitle: string;
  accountId: string;
  accountName: string;
  voice: string;
  status: QueueTaskStatus;
  total: number;
  done: number;
  failed: number;
  /** 已失败句文本：后续运行自动跳过（避免连续失败循环暂停），「重试」清空后重新尝试。 */
  failedTexts: string[];
  addedAt: number;
  finishedAt?: number;
  lastError?: string;
}

export type PauseReason = 'user' | 'failures' | null;

export interface QueueSnapshot {
  running: boolean;
  pauseReason: PauseReason;
  /** 本次会话累计新生成的字节数（不含缓存命中）。 */
  generatedBytes: number;
  tasks: QueueTask[];
}

/** 持久化形态（data.json 的 pregenQueue 字段）。 */
export interface QueuePersistData {
  version: 1;
  running: boolean;
  tasks: QueueTask[];
}

export interface PregenQueueDeps {
  storage: AudioStorage;
  synth: Synthesizer;
  getAccount(accountId: string): TtsAccountConfig | undefined;
  /** 账号的供应商是否支持预生成（capabilities.pregeneratable）。 */
  canPregenerate(account: TtsAccountConfig): boolean;
  /** 读笔记原文；null = 笔记不存在。 */
  readNote(notePath: string): Promise<string | null>;
  getConcurrencySettings(): {
    localTtsTotal: number;
    playbackBehavior: 'yield' | 'pause';
  };
  isPlaybackActive(): boolean;
  notify(message: string): void;
  /** 请求宿主落盘（宿主自行防抖）。 */
  persist(): void;
  newId(): string;
  /** 单句合成失败的重试间隔（ms）；默认 [1000, 4000]。 */
  retryDelays?: number[];
  /** 连续失败多少句后自动暂停队列；默认 10。 */
  failureStreakLimit?: number;
}

const TERMINAL_STATUS: ReadonlySet<QueueTaskStatus> = new Set([
  'done',
  'partial',
  'cancelled',
  'expired',
]);

const DEFAULT_RETRY_DELAYS = [1000, 4000];
const DEFAULT_FAILURE_STREAK_LIMIT = 10;
/** 每账号并发上限的钳制范围（1–8）。 */
const MAX_CONCURRENCY_CAP = 8;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameIdentity(
  task: { notePath: string; accountId: string; voice: string },
  notePath: string,
  accountId: string,
  voice: string,
): boolean {
  return task.notePath === notePath && task.accountId === accountId && task.voice === voice;
}

/**
 * 预生成队列：跨笔记的后台批量合成调度器。
 * - 句子级调度：按任务顺序填槽；账号并发上限 + 本地 TTS 全局总并发。
 * - 播放协调由宿主注入：'pause' 行为时播放活动期间不派发新句；'yield' 时播放请求
 *   在 SynthService 侧直接发出、不经此处的槽约束。
 * - 进度每次任务开始前重算（断句重跑 + hasMany），编辑过的笔记自动变成增量生成。
 */
export class PregenQueue {
  private tasks: QueueTask[] = [];
  private runningFlag = false;
  private pauseReason: PauseReason = null;
  private generatedBytes = 0;
  private failureStreak = 0;
  private pendingByTask = new Map<string, string[]>();
  /** 每任务的运行代号：暂停/恢复会重算进度，旧运行的在途结果不再计数（防止 done 越界）。 */
  private taskRunGen = new Map<string, number>();
  private inflightByTask = new Map<string, number>();
  private inflightByAccount = new Map<string, number>();
  private inflightLocal = 0;
  private preparing = new Set<string>();
  private listeners = new Set<(s: QueueSnapshot) => void>();
  private pumpQueued = false;

  constructor(private deps: PregenQueueDeps) {}

  onState(cb: (s: QueueSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  snapshot(): QueueSnapshot {
    return {
      running: this.runningFlag,
      pauseReason: this.pauseReason,
      generatedBytes: this.generatedBytes,
      tasks: this.tasks.map((task) => ({ ...task })),
    };
  }

  /** 恢复持久化的队列；返回持久化时是否在运行（宿主据 autoResume 决定是否 start）。 */
  restore(data: QueuePersistData | undefined): boolean {
    if (!data || !Array.isArray(data.tasks)) return false;
    this.tasks = data.tasks
      .filter(
        (task) =>
          task &&
          typeof task.id === 'string' &&
          typeof task.notePath === 'string' &&
          typeof task.accountId === 'string' &&
          typeof task.voice === 'string',
      )
      .map((task) => ({
        ...task,
        failedTexts: Array.isArray(task.failedTexts) ? task.failedTexts : [],
        failed: task.failed ?? 0,
        total: task.total ?? 0,
        done: task.done ?? 0,
        addedAt: task.addedAt ?? 0,
        // 上次运行到一半的任务回到等待态，恢复后重算进度续跑
        status: task.status === 'running' ? 'waiting' : task.status,
      }));
    this.runningFlag = false;
    this.pauseReason = null;
    this.emit();
    return data.running === true;
  }

  persistData(): QueuePersistData {
    return { version: 1, running: this.runningFlag, tasks: this.tasks };
  }

  // ===== 对外操作 =====

  /**
   * 入队一篇笔记。同一 笔记+账号+音色 已在排队/生成中 → 'duplicate'；
   * 已终结的同身份历史行会被新任务替换（再次入队 = 增量刷新）。
   */
  enqueue(
    note: { path: string; title: string },
    accountId: string,
    voice: string,
    accountName: string,
  ): 'added' | 'duplicate' {
    this.tasks = this.tasks.filter(
      (task) =>
        !(TERMINAL_STATUS.has(task.status) && sameIdentity(task, note.path, accountId, voice)),
    );
    if (this.tasks.some((task) => sameIdentity(task, note.path, accountId, voice))) {
      return 'duplicate';
    }
    this.tasks.push({
      id: this.deps.newId(),
      notePath: note.path,
      noteTitle: note.title,
      accountId,
      accountName,
      voice,
      status: 'waiting',
      total: 0,
      done: 0,
      failed: 0,
      failedTexts: [],
      addedAt: Date.now(),
    });
    this.emit();
    this.deps.persist();
    // 用户入队即意图生成：自动启动（连续失败自动暂停时不启动，避免空转）
    if (!this.runningFlag && this.pauseReason !== 'failures') this.start();
    else this.schedulePump();
    return 'added';
  }

  start(): void {
    this.runningFlag = true;
    this.pauseReason = null;
    this.failureStreak = 0;
    this.emit();
    this.deps.persist();
    this.schedulePump();
  }

  pause(): void {
    this.runningFlag = false;
    this.pauseReason = 'user';
    for (const task of this.tasks) {
      if (task.status === 'running') task.status = 'waiting';
    }
    this.emit();
    this.deps.persist();
  }

  /** 停止：未完成任务标记取消（保留在历史中）。宿主负责二次确认。 */
  stopAll(): void {
    this.runningFlag = false;
    this.pauseReason = 'user';
    for (const task of this.tasks) {
      if (task.status === 'waiting' || task.status === 'running') {
        task.status = 'cancelled';
        task.finishedAt = Date.now();
        this.clearTaskRuntime(task.id);
      }
    }
    this.emit();
    this.deps.persist();
  }

  /** 清空已终结任务（done/partial/cancelled/expired）。 */
  clearFinished(): void {
    for (const task of this.tasks) {
      if (TERMINAL_STATUS.has(task.status)) this.clearTaskRuntime(task.id);
    }
    this.tasks = this.tasks.filter((task) => !TERMINAL_STATUS.has(task.status));
    this.emit();
    this.deps.persist();
  }

  cancelTask(id: string): void {
    const task = this.tasks.find((task) => task.id === id);
    if (!task || TERMINAL_STATUS.has(task.status)) return;
    task.status = 'cancelled';
    task.finishedAt = Date.now();
    this.clearTaskRuntime(task.id);
    this.emit();
    this.deps.persist();
  }

  /** 重试部分失败的任务：清空失败记录（失败句重新纳入待生成）。 */
  retryTask(id: string): void {
    const task = this.tasks.find((task) => task.id === id);
    if (!task || task.status !== 'partial') return;
    task.status = 'waiting';
    task.failed = 0;
    task.failedTexts = [];
    task.lastError = undefined;
    this.emit();
    this.deps.persist();
    if (!this.runningFlag) this.start();
    else this.schedulePump();
  }

  /** 置顶。 */
  promote(id: string): void {
    const idx = this.tasks.findIndex((task) => task.id === id);
    if (idx <= 0) return;
    const [task] = this.tasks.splice(idx, 1);
    this.tasks.unshift(task);
    this.emit();
    this.deps.persist();
  }

  move(id: string, delta: 1 | -1): void {
    const idx = this.tasks.findIndex((task) => task.id === id);
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= this.tasks.length) return;
    [this.tasks[idx], this.tasks[next]] = [this.tasks[next], this.tasks[idx]];
    this.emit();
    this.deps.persist();
  }

  /** 笔记改名：任务同步改路径与标题。 */
  renameNote(oldPath: string, newPath: string, newTitle: string): void {
    let changed = false;
    for (const task of this.tasks) {
      if (task.notePath === oldPath) {
        task.notePath = newPath;
        task.noteTitle = newTitle;
        changed = true;
      }
    }
    if (changed) {
      this.emit();
      this.deps.persist();
    }
  }

  /** 笔记删除：相关任务标记过期。 */
  removeNote(notePath: string): void {
    let changed = false;
    for (const task of this.tasks) {
      if (task.notePath === notePath && !TERMINAL_STATUS.has(task.status)) {
        task.status = 'expired';
        task.lastError = t('queue.expire-note');
        task.finishedAt = Date.now();
        this.clearTaskRuntime(task.id);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
      this.deps.persist();
    }
  }

  /** 账号增删改后调用：账号已不存在的任务标记过期。 */
  onAccountsChanged(): void {
    let changed = false;
    for (const task of this.tasks) {
      if (!TERMINAL_STATUS.has(task.status) && !this.deps.getAccount(task.accountId)) {
        task.status = 'expired';
        task.lastError = t('queue.expire-account');
        task.finishedAt = Date.now();
        this.clearTaskRuntime(task.id);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
      this.deps.persist();
    }
  }

  /** 播放状态变化（'pause' 行为下由宿主通知，恢复派发）。 */
  notifyPlaybackChanged(): void {
    this.schedulePump();
  }

  /** 插件卸载：停止调度（在途请求自然完成并落缓存）。 */
  dispose(): void {
    this.runningFlag = false;
    this.listeners.clear();
  }

  // ===== 调度 =====

  private schedulePump(): void {
    if (this.pumpQueued) return;
    this.pumpQueued = true;
    queueMicrotask(() => {
      this.pumpQueued = false;
      this.pump();
    });
  }

  private canDispatch(): boolean {
    if (!this.runningFlag) return false;
    const { playbackBehavior } = this.deps.getConcurrencySettings();
    if (playbackBehavior === 'pause' && this.deps.isPlaybackActive()) return false;
    return true;
  }

  private pump(): void {
    if (!this.canDispatch()) return;
    for (const task of [...this.tasks]) {
      if (task.status === 'waiting' && !this.preparing.has(task.id)) {
        this.preparing.add(task.id);
        void this.prepareTask(task).finally(() => {
          this.preparing.delete(task.id);
          this.schedulePump();
        });
      } else if (task.status === 'running') {
        this.dispatch(task, this.taskRunGen.get(task.id) ?? 0);
      }
    }
  }

  /** 任务启动前的准备：重断句 + 批量查缓存 → 得出待生成句列表（增量语义）。 */
  private async prepareTask(task: QueueTask): Promise<void> {
    const account = this.deps.getAccount(task.accountId);
    if (!account) {
      this.expire(task, t('queue.expire-account'));
      return;
    }
    if (!this.deps.canPregenerate(account)) {
      this.expire(task, t('queue.expire-provider'));
      return;
    }
    const md = await this.deps.readNote(task.notePath);
    if (md === null) {
      this.expire(task, t('queue.expire-note'));
      return;
    }
    if (task.status !== 'waiting' || !this.runningFlag) return;
    const units = await buildUnits(md);
    if (task.status !== 'waiting' || !this.runningFlag) return;
    task.total = units.length;
    if (!units.length) {
      task.done = 0;
      task.failed = task.failedTexts.length;
      this.finish(task, true);
      this.schedulePump();
      return;
    }
    const keys = await Promise.all(
      units.map((u) => this.deps.synth.keyFor(account, task.voice, u.text)),
    );
    if (task.status !== 'waiting' || !this.runningFlag) return;
    const existing = await this.deps.storage.hasMany(keys);
    if (task.status !== 'waiting' || !this.runningFlag) return;
    // 已失败句跳过（避免硬故障下「重启→再失败→再暂停」循环），重试按钮清空后重新纳入
    const failedTexts = new Set(task.failedTexts);
    const pending = units
      .filter((u, i) => !existing.has(keys[i]) && !failedTexts.has(u.text))
      .map((u) => u.text);
    task.total = units.length;
    task.done = keys.filter((k) => existing.has(k)).length;
    task.failed = task.failedTexts.length;
    if (!pending.length) {
      this.finish(task, true);
      this.schedulePump();
      return;
    }
    task.status = 'running';
    this.taskRunGen.set(task.id, (this.taskRunGen.get(task.id) ?? 0) + 1);
    this.pendingByTask.set(task.id, pending);
    this.emit();
    this.deps.persist();
    this.dispatch(task, this.taskRunGen.get(task.id) as number);
    this.schedulePump();
  }

  /** 为一个运行中任务按账号并发/本地总并发约束派发句子。 */
  private dispatch(task: QueueTask, gen: number): void {
    if (task.status !== 'running' || !this.canDispatch()) return;
    const account = this.deps.getAccount(task.accountId);
    if (!account) {
      this.expire(task, t('queue.expire-account'));
      return;
    }
    const maxConc = Math.min(MAX_CONCURRENCY_CAP, Math.max(1, account.maxConcurrency ?? 1));
    const local = !!account.isLocalTts;
    const localCap = Math.max(1, this.deps.getConcurrencySettings().localTtsTotal);
    for (;;) {
      if (!this.canDispatch()) return;
      const pending = this.pendingByTask.get(task.id);
      if (!pending || !pending.length) return;
      const inflight = this.inflightByAccount.get(account.id) ?? 0;
      if (inflight >= maxConc) return;
      if (local && this.inflightLocal >= localCap) return;
      const text = pending.shift() as string;
      this.pendingByTask.set(task.id, pending);
      this.inflightByTask.set(task.id, (this.inflightByTask.get(task.id) ?? 0) + 1);
      this.inflightByAccount.set(account.id, inflight + 1);
      if (local) this.inflightLocal++;
      void this.runSentence(task, account, text, gen);
    }
  }

  private async runSentence(
    task: QueueTask,
    account: TtsAccountConfig,
    text: string,
    gen: number,
  ): Promise<void> {
    const delays = this.deps.retryDelays ?? DEFAULT_RETRY_DELAYS;
    let result: { ok: true; outcome: SynthOutcome } | { ok: false; error: string } | null = null;
    for (let attempt = 0; ; attempt++) {
      // 暂停/停止后不再发起新尝试；句子未落缓存，恢复后重算进度自然补上
      if (!this.runningFlag) break;
      try {
        const outcome = await this.deps.synth.synthesize({
          account,
          voice: task.voice,
          text,
          notePath: task.notePath,
        });
        result = { ok: true, outcome };
        break;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (attempt >= delays.length) {
          result = { ok: false, error };
          break;
        }
        await delay(delays[attempt]);
      }
    }

    // 释放槽位（无论代号是否过期都要释放）
    this.inflightByTask.set(task.id, Math.max(0, (this.inflightByTask.get(task.id) ?? 1) - 1));
    this.inflightByAccount.set(
      account.id,
      Math.max(0, (this.inflightByAccount.get(account.id) ?? 1) - 1),
    );
    if (account.isLocalTts) this.inflightLocal = Math.max(0, this.inflightLocal - 1);

    // 代号过期（暂停/恢复/取消后旧运行的迟到结果）：只释放槽位，不再计数
    if (this.taskRunGen.get(task.id) !== gen) {
      this.schedulePump();
      return;
    }

    if (result?.ok) {
      if (!result.outcome.fromCache) this.generatedBytes += result.outcome.blob.size;
      this.failureStreak = 0;
      task.done++;
    } else if (result) {
      task.lastError = result.error;
      if (!task.failedTexts.includes(text)) task.failedTexts.push(text);
      task.failed = task.failedTexts.length;
      this.failureStreak++;
      if (this.runningFlag) {
        const limit = this.deps.failureStreakLimit ?? DEFAULT_FAILURE_STREAK_LIMIT;
        if (this.failureStreak >= limit) {
          this.runningFlag = false;
          this.pauseReason = 'failures';
          for (const t of this.tasks) {
            if (t.status === 'running') t.status = 'waiting';
          }
          this.deps.notify(
            t('queue.auto-paused', { n: limit, error: (task.lastError ?? '').slice(0, 120) }),
          );
        }
      }
    }

    if (task.status === 'running') {
      const pending = this.pendingByTask.get(task.id) ?? [];
      const inflight = this.inflightByTask.get(task.id) ?? 0;
      if (!pending.length && !inflight) this.finish(task, false);
    }
    this.emit();
    this.deps.persist();
    this.schedulePump();
  }

  private finish(task: QueueTask, instant: boolean): void {
    task.status = task.failedTexts.length > 0 ? 'partial' : 'done';
    task.finishedAt = Date.now();
    this.clearTaskRuntime(task.id);
    if (instant) {
      this.deps.notify(
        task.total === 0
          ? t('queue.task-empty', { note: task.noteTitle })
          : t('queue.task-uptodate', { note: task.noteTitle }),
      );
    } else if (task.failed > 0) {
      this.deps.notify(
        t('queue.task-partial', { note: task.noteTitle, total: task.total, failed: task.failed }),
      );
    } else {
      this.deps.notify(t('queue.task-done', { note: task.noteTitle, total: task.total }));
    }
    this.emit();
    this.deps.persist();
  }

  private expire(task: QueueTask, reason: string): void {
    task.status = 'expired';
    task.lastError = reason;
    task.finishedAt = Date.now();
    this.clearTaskRuntime(task.id);
    this.emit();
    this.deps.persist();
  }

  private emit(): void {
    const s = this.snapshot();
    for (const cb of this.listeners) cb(s);
  }

  /** 任务终结时清理运行期状态（迟到的在途结果只释放槽位、不再计数）。 */
  private clearTaskRuntime(taskId: string): void {
    this.pendingByTask.delete(taskId);
    this.taskRunGen.delete(taskId);
  }
}
