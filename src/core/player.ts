import { Notice } from 'obsidian';
import { t } from '../i18n';
import type { ResolvedVoice } from './accounts';
import type { Synthesizer } from './synth-service';
import {
  bindMediaSession,
  clearMediaSession,
  updateMediaState,
  updatePositionState,
} from './mediasession';
import type { ReadingUnit } from './sentences';

export interface PlayerState {
  playing: boolean;
  paused: boolean;
  loading: boolean;
  currentIdx: number;
  total: number;
}

export interface PlayerDeps {
  synth: Synthesizer;
  getVoice(): ResolvedVoice;
  getRate(): number;
  getSkipBackSeconds(): number;
  getNotePath(): string | null;
  getNoteTitle(): string;
}

/**
 * 回退 N 秒的落点计算（纯函数，便于单测）。
 * 当前句剩余不足时按已播句的历史时长逐句回溯；遇到未知时长的句子则从该句开头重播。
 */
export function computeSeekBack(
  currentIdx: number,
  currentSec: number,
  backSec: number,
  durationOf: (idx: number) => number | undefined,
): { idx: number; offsetSec: number } {
  if (currentIdx < 0) return { idx: 0, offsetSec: 0 };
  if (currentSec >= backSec) return { idx: currentIdx, offsetSec: currentSec - backSec };
  let remaining = backSec - currentSec;
  for (let i = currentIdx - 1; i >= 0; i--) {
    const d = durationOf(i);
    if (d === undefined) return { idx: i, offsetSec: 0 };
    if (remaining > d) {
      remaining -= d;
      continue;
    }
    return { idx: i, offsetSec: d - remaining };
  }
  return { idx: 0, offsetSec: 0 };
}

/** 播放状态机：句级连读、预取、回退；gen 计数器作废过期的异步结果。整篇预生成由队列模块负责。 */
export class Player {
  private units: ReadingUnit[] = [];
  private idIndex = new Map<string, number>();
  private audio: HTMLAudioElement | null = null;
  private gen = 0;
  private curIdx = -1;
  private playingFlag = false;
  private pausedFlag = false;
  private loadingFlag = false;
  private urlCache = new Map<string, string>();
  /** 已播句的历史时长（秒），seekBack 跨句回溯用 */
  private durations = new Map<number, number>();
  private pendingSeek: number | null = null;
  private noteTitle = '';

  private stateListeners = new Set<(s: PlayerState) => void>();
  private currentListeners = new Set<(id: string | null) => void>();

  constructor(private deps: PlayerDeps) {
    bindMediaSession({
      play: () => this.play(),
      pause: () => this.pause(),
      stop: () => this.stop(),
      prev: () => this.prev(),
      next: () => this.next(),
      seekBack: () => this.seekBack(),
    });
  }

  /** 多订阅者：面板、正文高亮器各自订阅，互不覆盖。 */
  onState(cb: (s: PlayerState) => void): () => void {
    this.stateListeners.add(cb);
    cb(this.getState());
    return () => this.stateListeners.delete(cb);
  }

  onCurrent(cb: (id: string | null) => void): () => void {
    this.currentListeners.add(cb);
    return () => this.currentListeners.delete(cb);
  }

  /** 切换/刷新笔记：重建句子集；播放中先停止（续播由调用方按当前句 id 处理）。 */
  setNote(units: ReadingUnit[], opts: { title: string; path: string | null }): void {
    this.units = units;
    this.idIndex = new Map(units.map((u, k) => [u.id, k]));
    this.noteTitle = opts.title;
    if (this.playingFlag) this.stop();
    this.emit();
  }

  getUnits(): ReadingUnit[] {
    return this.units;
  }

  currentUnit(): ReadingUnit | null {
    return this.curIdx >= 0 ? (this.units[this.curIdx] ?? null) : null;
  }

  getState(): PlayerState {
    return {
      playing: this.playingFlag,
      paused: this.pausedFlag,
      loading: this.loadingFlag,
      currentIdx: this.curIdx,
      total: this.units.length,
    };
  }

  isPlaying(): boolean {
    return this.playingFlag && !this.pausedFlag;
  }

  /** 通知外部状态刷新（如点读模式开关变化后面板重绘）。 */
  notifyExternal(): void {
    this.emit();
  }

  playFromId(id: string): void {
    const i = this.idIndex.get(id);
    if (i === undefined) {
      new Notice(t('player.sentence-changed'));
      return;
    }
    void this.playIndex(i, ++this.gen);
  }

  playFromIndex(i: number): void {
    if (i < 0 || i >= this.units.length) return;
    void this.playIndex(i, ++this.gen);
  }

  play(): void {
    if (this.units.length === 0) {
      new Notice(t('player.no-content'));
      return;
    }
    if (this.pausedFlag && this.audio) {
      void this.audio.play().catch(() => {});
      this.pausedFlag = false;
      this.emit();
      return;
    }
    void this.playIndex(Math.max(0, this.curIdx), ++this.gen);
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.pausedFlag = true;
      this.emit();
    } else if (this.playingFlag && this.deps.getVoice().provider.capabilities.direct) {
      this.deps.getVoice().provider.cancelDirect?.();
      this.pausedFlag = true;
      this.emit();
    }
  }

  stop(): void {
    this.gen++;
    const { provider } = this.deps.getVoice();
    provider.cancelDirect?.();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
    this.playingFlag = false;
    this.pausedFlag = false;
    this.loadingFlag = false;
    this.curIdx = -1;
    this.fireCurrent(null);
    clearMediaSession();
    this.emit();
  }

  next(): void {
    if (this.curIdx < this.units.length - 1) this.playFromIndex(this.curIdx + 1);
  }

  prev(): void {
    if (this.curIdx > 0) this.playFromIndex(this.curIdx - 1);
  }

  /** 回退 N 秒：当前句内 seek；不足则按历史时长跨句回溯。 */
  seekBack(): void {
    if (this.curIdx < 0) return;
    const back = this.deps.getSkipBackSeconds();
    const target = computeSeekBack(this.curIdx, this.audio?.currentTime ?? 0, back, (i) =>
      this.durations.get(i),
    );
    if (this.deps.getVoice().provider.capabilities.direct) {
      // Web Speech 无法句内 seek：跳到计算出的句子从头播放
      this.playFromIndex(target.idx);
      return;
    }
    if (target.idx === this.curIdx && this.audio) {
      this.audio.currentTime = target.offsetSec;
      return;
    }
    this.pendingSeek = target.offsetSec;
    this.playFromIndex(target.idx);
  }

  /** 快进 N 秒：当前句内 seek；越界则跳到下一句开头（近似）。 */
  seekForward(): void {
    if (this.curIdx < 0) return;
    if (this.deps.getVoice().provider.capabilities.direct) {
      this.next();
      return;
    }
    const a = this.audio;
    if (!a) return;
    const fwd = this.deps.getSkipBackSeconds();
    if (isFinite(a.duration) && a.currentTime + fwd >= a.duration - 0.05) {
      this.next();
      return;
    }
    a.currentTime = Math.min(a.currentTime + fwd, Math.max((a.duration || 0) - 0.05, 0));
  }

  /** 当前句内播放位置（面板进度条轮询用）；非音频引擎或未播放时为 null。 */
  getPosition(): { positionSec: number; durationSec: number } | null {
    const a = this.audio;
    if (!a || this.deps.getVoice().provider.capabilities.direct) return null;
    if (!isFinite(a.duration) || a.duration <= 0) return null;
    return { positionSec: a.currentTime, durationSec: a.duration };
  }

  /** 句内 seek（面板进度条拖动）。 */
  seekTo(sec: number): void {
    const a = this.audio;
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = Math.min(Math.max(sec, 0), a.duration - 0.05);
  }

  setRate(r: number): void {
    if (this.audio) this.audio.playbackRate = r;
  }

  /** 释放资源（插件卸载）。 */
  dispose(): void {
    this.stop();
    for (const url of this.urlCache.values()) URL.revokeObjectURL(url);
    this.urlCache.clear();
  }

  private emit(): void {
    const s = this.getState();
    for (const cb of this.stateListeners) cb(s);
  }

  private fireCurrent(id: string | null): void {
    for (const cb of this.currentListeners) cb(id);
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.addEventListener('ended', () => {
        if (this.curIdx >= 0 && this.curIdx < this.units.length - 1) {
          void this.playIndex(this.curIdx + 1, this.gen);
        } else {
          this.stop();
        }
      });
      this.audio.addEventListener('loadedmetadata', () => {
        const a = this.audio;
        if (!a) return;
        if (this.curIdx >= 0 && isFinite(a.duration)) {
          this.durations.set(this.curIdx, a.duration);
        }
        if (this.pendingSeek !== null && isFinite(a.duration)) {
          a.currentTime = Math.min(this.pendingSeek, Math.max(a.duration - 0.05, 0));
          this.pendingSeek = null;
        }
        updatePositionState(a.duration, a.currentTime, a.playbackRate);
      });
      this.audio.addEventListener('timeupdate', () => {
        const a = this.audio;
        if (!a) return;
        updatePositionState(a.duration, a.currentTime, a.playbackRate);
      });
    }
    return this.audio;
  }

  /** 取一句音频的 objectURL：内存 → 共享合成服务（缓存查询 + 合成落缓存，in-flight 去重）。 */
  private async getUrl(text: string): Promise<string> {
    const { provider, account } = this.deps.getVoice();
    if (!provider.capabilities.cacheable || !account) {
      throw new Error('当前引擎不支持音频缓存');
    }
    const r = await this.deps.synth.synthesize({
      account,
      voice: account.voice,
      text,
      notePath: this.deps.getNotePath(),
    });
    const hit = this.urlCache.get(r.key);
    if (hit) return hit;
    const url = URL.createObjectURL(r.blob);
    this.urlCache.set(r.key, url);
    return url;
  }

  private async playIndex(i: number, myGen: number): Promise<void> {
    if (myGen !== this.gen) return;
    const u = this.units[i];
    if (!u) return;
    // 立即停掉上一段声音：点击换句时旧音频马上静音，不等新句合成完毕
    this.deps.getVoice().provider.cancelDirect?.();
    if (this.audio && !this.audio.paused) this.audio.pause();
    this.curIdx = i;
    this.playingFlag = true;
    this.pausedFlag = false;
    this.loadingFlag = true;
    this.fireCurrent(u.id);
    this.emit();

    const { provider, account } = this.deps.getVoice();
    const rate = this.deps.getRate();
    updateMediaState({
      playing: true,
      title: this.noteTitle || this.deps.getNoteTitle(),
      sentence: u.text,
    });

    if (provider.capabilities.direct) {
      this.loadingFlag = false;
      this.emit();
      const startedAt = Date.now();
      provider.speakDirect?.(
        u.text,
        { rate, language: account?.language ?? 'Chinese' },
        () => {
          // 墙钟近似时长，供 seekBack 跨句回溯
          this.durations.set(i, (Date.now() - startedAt) / 1000);
          if (myGen === this.gen && i < this.units.length - 1) void this.playIndex(i + 1, myGen);
          else this.stop();
        },
        (e) => {
          if (myGen !== this.gen) return;
          new Notice(`${t('player.speak-failed')}：${e}`);
          this.stop();
        },
      );
      return;
    }

    try {
      const url = await this.getUrl(u.text);
      if (myGen !== this.gen) return;
      const audio = this.ensureAudio();
      audio.src = url;
      audio.playbackRate = rate;
      this.loadingFlag = false;
      this.emit();
      await audio.play().catch(() => {});
      updateMediaState({
        playing: true,
        title: this.noteTitle || this.deps.getNoteTitle(),
        sentence: u.text,
      });
      // 预取下一句：合成与播放并行，实现句间无缝
      const nxt = this.units[i + 1];
      if (nxt) void this.getUrl(nxt.text).catch(() => {});
    } catch (e) {
      if (myGen !== this.gen) return;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[voice-aloud] synthesize/play failed:', e);
      new Notice(`${t('player.tts-failed')}：${msg.slice(0, 160)}`);
      this.stop();
    }
  }
}
