import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { Player, PlayerState } from '../core/player';
import { t } from '../i18n';

export const VIEW_TYPE_VOICE_ALOUD = 'voice-aloud-view';

/** 面板对宿主插件的最小依赖（避免与 main.ts 循环引用）。 */
export interface PlayerPanelHost {
  settings: { rate: number; skipBackSeconds: number };
  isPointReadActive(): boolean;
  togglePointRead(): Promise<void>;
  isFollowReadActive(): boolean;
  toggleFollowRead(): Promise<void>;
  /** 账号/音色选择（不做全局绑定，面板上每次可选，类似 obsidian-voice）。 */
  accountOptions(): { id: string; label: string }[];
  currentAccountId(): string | null;
  setCurrentAccount(id: string | null): Promise<void>;
  currentVoice(): string;
  setCurrentVoice(voice: string): Promise<void>;
  voicesForCurrentAccount(): Promise<string[]>;
  saveSettings(): Promise<void>;
  /** 把当前笔记加入预生成队列并启动（面板「预生成」按钮）。 */
  enqueueCurrentNote(): Promise<void>;
  /** 打开预生成队列视图。 */
  openQueueView(): void;
  /** 当前笔记在预生成队列中的进行中任务（等待/生成中）；null = 未入队列。 */
  notePregenProgress(): { status: 'waiting' | 'running'; done: number; total: number } | null;
}

const RATES = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 有声书风格播放面板（视觉参考 obsidian-voice）：
 * 当前句展示 → 句内进度条 → 传输控制（大播放键）→ 次级控制（点读/预生成/语速）。
 * 按 250ms 轮询同步进度（与音频引擎解耦，引擎切换无需重接线）。
 * 按钮使用真 <button>：面板未聚焦时单击依然生效（div 的首次点击会被面板激活吃掉）。
 */
export class PlayerPanelView extends ItemView {
  private headerTitleEl!: HTMLElement;
  private headerSubtitleEl!: HTMLElement;
  private nowPlayingEl!: HTMLElement;
  private nowPlayingTextEl!: HTMLElement;
  private currentTimeEl!: HTMLElement;
  private durationEl!: HTMLElement;
  private scrubberEl!: HTMLInputElement;
  private playBtn!: HTMLButtonElement;
  private rewindBtn!: HTMLButtonElement;
  private forwardBtn!: HTMLButtonElement;
  private pointReadBtn!: HTMLButtonElement;
  private followReadBtn!: HTMLButtonElement;
  private pregenBtn!: HTMLButtonElement;
  private pregenPctEl: HTMLElement | null = null;
  private speedDownBtn!: HTMLButtonElement;
  private speedUpBtn!: HTMLButtonElement;
  private speedValueEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private accountSelect!: HTMLSelectElement;
  private voiceSelect!: HTMLSelectElement;
  private voiceRowEl!: HTMLElement;

  private isScrubbing = false;
  private unsubState: (() => void) | null = null;
  private unsubCurrent: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private player: Player,
    private host: PlayerPanelHost,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_VOICE_ALOUD;
  }

  override getDisplayText(): string {
    return t('player.display-name');
  }

  override getIcon(): string {
    return 'headphones';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('va-view');
    this.buildDom();
    this.unsubState = this.player.onState(() => this.onState());
    this.unsubCurrent = this.player.onCurrent(() => this.onState());
    // 250ms 轮询进度条（拖动中让位给用户）与预生成按钮进度
    this.registerInterval(
      window.setInterval(() => {
        if (!this.isScrubbing) this.updateSeek();
        this.updatePregen();
      }, 250),
    );
    this.onState();
  }

  override async onClose(): Promise<void> {
    this.unsubState?.();
    this.unsubCurrent?.();
    this.unsubState = null;
    this.unsubCurrent = null;
  }

  private buildDom(): void {
    const root = this.contentEl.createDiv('va-player');

    // Header：笔记名 + 副标题（句数 · 音色）
    const header = root.createDiv('va-player-header');
    this.headerTitleEl = header.createDiv('va-player-title');
    this.headerTitleEl.setText(t('player.display-name'));
    this.headerSubtitleEl = header.createDiv('va-player-subtitle');

    // 当前句展示（点击定位正文）
    const now = root.createDiv('va-player-now');
    this.nowPlayingEl = now.createDiv('va-player-now-label');
    this.nowPlayingTextEl = now.createDiv('va-player-now-text');
    now.addEventListener('click', () => {
      const u = this.player.currentUnit();
      if (!u) return;
      const el = document.querySelector(`.va-sent[data-va="${u.id}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    // 句内进度条
    const seek = root.createDiv('va-player-seek');
    this.currentTimeEl = seek.createSpan('va-player-time');
    this.currentTimeEl.setText('0:00');
    this.scrubberEl = seek.createEl('input', 'va-player-scrubber');
    this.scrubberEl.type = 'range';
    this.scrubberEl.min = '0';
    this.scrubberEl.max = '0';
    this.scrubberEl.value = '0';
    this.scrubberEl.step = '0.1';
    this.registerDomEvent(this.scrubberEl, 'input', () => {
      this.isScrubbing = true;
      this.currentTimeEl.setText(formatTime(Number(this.scrubberEl.value)));
    });
    this.registerDomEvent(this.scrubberEl, 'change', () => {
      this.player.seekTo(Number(this.scrubberEl.value));
      this.isScrubbing = false;
    });
    this.durationEl = seek.createSpan('va-player-time');
    this.durationEl.setText('0:00');

    // 传输控制：上一句 | 回退N | 播放/暂停 | 快进N | 下一句
    const transport = root.createDiv('va-player-transport');

    this.transportBtn(
      transport,
      'skip-back',
      t('player.prev'),
      () => this.player.prev(),
      'va-player-track',
    );

    this.rewindBtn = this.transportBtn(
      transport,
      'rewind',
      t('player.seek-back', { n: this.host.settings.skipBackSeconds }),
      () => this.player.seekBack(),
      'va-player-skip',
    );
    this.rewindBtn
      .createSpan('va-player-skip-label')
      .setText(String(this.host.settings.skipBackSeconds));

    this.playBtn = this.transportBtn(
      transport,
      'play',
      t('player.play-pause'),
      () => {
        if (this.player.isPlaying()) this.player.pause();
        else this.player.play();
      },
      'va-player-play',
    );

    this.forwardBtn = this.transportBtn(
      transport,
      'fast-forward',
      t('player.seek-forward', { n: this.host.settings.skipBackSeconds }),
      () => this.player.seekForward(),
      'va-player-skip',
    );
    this.forwardBtn
      .createSpan('va-player-skip-label')
      .setText(String(this.host.settings.skipBackSeconds));

    this.transportBtn(
      transport,
      'skip-forward',
      t('player.next'),
      () => this.player.next(),
      'va-player-track',
    );

    // 次级控制：点读 | 跟读 | 预生成（入队并开始；已入队时按钮显示进度，点击查看队列）| 语速 -/+
    const secondary = root.createDiv('va-player-secondary');

    this.pointReadBtn = secondary.createEl('button', 'va-player-toggle');
    setIcon(this.pointReadBtn, 'mouse-pointer-click');
    this.pointReadBtn.ariaLabel = t('player.point-read');
    this.pointReadBtn.addEventListener('click', async () => {
      await this.host.togglePointRead();
      this.onState();
    });

    this.followReadBtn = secondary.createEl('button', 'va-player-toggle');
    setIcon(this.followReadBtn, 'book-open-text');
    this.followReadBtn.ariaLabel = t('player.follow-read');
    this.followReadBtn.addEventListener('click', async () => {
      await this.host.toggleFollowRead();
      this.onState();
    });

    this.pregenBtn = secondary.createEl('button', 'va-player-pregen');
    setIcon(this.pregenBtn, 'audio-waveform');
    this.pregenBtn.ariaLabel = t('player.pregen');
    this.pregenBtn.addEventListener('click', () => {
      if (this.host.notePregenProgress()) this.host.openQueueView();
      else void this.host.enqueueCurrentNote();
    });

    const speedGroup = secondary.createDiv('va-player-speed');
    this.speedDownBtn = speedGroup.createEl('button', 'va-player-speed-btn');
    setIcon(this.speedDownBtn, 'minus');
    this.speedDownBtn.ariaLabel = t('player.speed-down');
    this.speedDownBtn.addEventListener('click', () => this.stepRate(-1));
    this.speedValueEl = speedGroup.createSpan('va-player-speed-value');
    this.speedUpBtn = speedGroup.createEl('button', 'va-player-speed-btn');
    setIcon(this.speedUpBtn, 'plus');
    this.speedUpBtn.ariaLabel = t('player.speed-up');
    this.speedUpBtn.addEventListener('click', () => this.stepRate(1));

    // 状态行（预生成进度等）
    this.statusEl = root.createDiv('va-player-status');

    // 账号 / 音色选择行（不做全局绑定，每次可选；参考 obsidian-voice 的 options row）
    const options = root.createDiv('va-player-options');
    this.accountSelect = options.createEl('select', 'va-player-select');
    this.accountSelect.ariaLabel = t('player.account');
    this.accountSelect.addEventListener('change', async () => {
      const v = this.accountSelect.value;
      await this.host.setCurrentAccount(v || null);
      await this.renderOptions();
      this.onState();
    });

    this.voiceRowEl = options.createDiv('va-player-voice-row');
    this.voiceSelect = this.voiceRowEl.createEl('select', 'va-player-select');
    this.voiceSelect.ariaLabel = t('player.voice');
    this.voiceSelect.addEventListener('change', async () => {
      await this.host.setCurrentVoice(this.voiceSelect.value);
      this.onState();
    });

    void this.renderOptions();
  }

  /** 重建账号/音色下拉（音色列表来自供应商，异步加载）。 */
  private async renderOptions(): Promise<void> {
    const accounts = this.host.accountOptions();
    const currentId = this.host.currentAccountId();
    this.accountSelect.empty();
    for (const a of accounts) {
      this.accountSelect.createEl('option', { value: a.id, text: a.label });
    }
    this.accountSelect.value = currentId ?? '';

    const voices = await this.host.voicesForCurrentAccount();
    const currentVoice = this.host.currentVoice();
    if (voices.length) {
      this.voiceRowEl.show();
      this.voiceSelect.empty();
      for (const v of voices) {
        this.voiceSelect.createEl('option', { value: v, text: v });
      }
      if (currentVoice && !voices.includes(currentVoice)) {
        this.voiceSelect.createEl('option', { value: currentVoice, text: currentVoice });
      }
      this.voiceSelect.value = currentVoice;
    } else {
      this.voiceRowEl.hide();
    }
  }

  private transportBtn(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
    extraCls: string,
  ): HTMLButtonElement {
    const btn = parent.createEl('button', `va-player-btn ${extraCls}`);
    setIcon(btn, icon);
    btn.ariaLabel = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private stepRate(dir: -1 | 1): void {
    const cur = RATES.reduce(
      (best, r) =>
        Math.abs(r - this.host.settings.rate) < Math.abs(best - this.host.settings.rate) ? r : best,
      RATES[0],
    );
    const idx = RATES.indexOf(cur);
    const next = RATES[Math.min(RATES.length - 1, Math.max(0, idx + dir))];
    this.host.settings.rate = next;
    this.player.setRate(next);
    void this.host.saveSettings();
    this.onState();
  }

  setNoteTitle(title: string): void {
    this.headerTitleEl.setText(title || t('player.display-name'));
    this.onState();
  }

  refresh(): void {
    // 账号列表可能已变（设置页增删改），重建下拉选项
    void this.renderOptions();
    this.onState();
  }

  private updateSeek(): void {
    const pos = this.player.getPosition();
    if (!pos) {
      this.scrubberEl.disabled = true;
      return;
    }
    this.scrubberEl.disabled = false;
    this.scrubberEl.max = String(Math.max(pos.durationSec - 0.05, 0));
    if (!this.isScrubbing) {
      this.scrubberEl.value = String(Math.min(pos.positionSec, pos.durationSec));
      this.currentTimeEl.setText(formatTime(pos.positionSec));
    }
    this.durationEl.setText(formatTime(pos.durationSec));
  }

  private onState(): void {
    const s: PlayerState = this.player.getState();
    this.rewindBtn.ariaLabel = t('player.seek-back', { n: this.host.settings.skipBackSeconds });
    this.forwardBtn.ariaLabel = t('player.seek-forward', { n: this.host.settings.skipBackSeconds });

    // 播放大圆钮：合成中转圈，其余时间为播放/暂停图标（不显示百分比）
    this.playBtn.empty();
    if (s.loading) {
      setIcon(this.playBtn, 'loader-circle');
      this.playBtn.addClass('is-spinning');
    } else {
      this.playBtn.removeClass('is-spinning');
      setIcon(this.playBtn, s.paused ? 'play' : 'pause');
    }

    // 副标题：句数 · 当前账号（· 音色）
    if (s.total) {
      const id = this.host.currentAccountId();
      const label =
        this.host.accountOptions().find((a) => a.id === id)?.label ?? t('player.system-voice');
      const voice = this.host.currentVoice();
      this.headerSubtitleEl.setText(
        voice ? t('player.subtitle', { total: s.total, voice: `${label} · ${voice}` }) : label,
      );
    } else {
      this.headerSubtitleEl.setText('');
    }

    // 当前句展示
    const u = this.player.currentUnit();
    if (u) {
      this.nowPlayingEl.setText(
        t('player.now-playing', { current: s.currentIdx + 1, total: s.total }),
      );
      this.nowPlayingTextEl.setText(u.text);
      this.nowPlayingTextEl.addClass('is-live');
    } else {
      this.nowPlayingEl.setText(s.total ? t('player.open-hint') : t('player.no-content'));
      this.nowPlayingTextEl.setText('');
      this.nowPlayingTextEl.removeClass('is-live');
    }

    // 状态行：闲置隐藏
    const statusText = s.total ? '' : t('player.no-content');
    this.statusEl.setText(statusText);
    this.statusEl.toggleClass('is-hidden', !statusText);

    // 点读/跟读开关状态
    this.pointReadBtn.toggleClass('is-active', this.host.isPointReadActive());
    this.followReadBtn.toggleClass('is-active', this.host.isFollowReadActive());

    // 语速显示
    this.speedValueEl.setText(`${this.host.settings.rate}x`);

    this.updatePregen();
    this.updateSeek();
  }

  /**
   * 预生成按钮三态：未入队（波形图标）| 等待中（波形脉冲，总句数未知）|
   * 生成中（百分比数字）。仅内容变化时重建 DOM，避免 250ms 轮询反复重绘。
   */
  private updatePregen(): void {
    const p = this.host.notePregenProgress();
    const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : null;
    const mode: 'idle' | 'wait' | 'run' = !p ? 'idle' : pct === null ? 'wait' : 'run';
    if (this.pregenBtn.dataset.mode !== mode) {
      this.pregenBtn.dataset.mode = mode;
      this.pregenBtn.empty();
      this.pregenPctEl = null;
      if (mode === 'run') this.pregenPctEl = this.pregenBtn.createSpan('va-player-pregen-pct');
      else setIcon(this.pregenBtn, 'audio-waveform');
    }
    if (this.pregenPctEl && pct !== null) {
      const text = `${pct}%`;
      if (this.pregenPctEl.getText() !== text) this.pregenPctEl.setText(text);
    }
    this.pregenBtn.toggleClass('is-active', !!p);
    this.pregenBtn.toggleClass('is-waiting', mode === 'wait');
    this.pregenBtn.ariaLabel = !p
      ? t('player.pregen')
      : pct === null
        ? t('player.pregen-queued')
        : t('player.pregen-progress', { done: p.done, total: p.total, pct });
  }
}
