import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { Player, PlayerState } from '../core/player';
import { t } from '../i18n';

export const VIEW_TYPE_VOICE_ALOUD = 'voice-aloud-view';

/** 面板对宿主插件的最小依赖（避免与 main.ts 循环引用）。 */
export interface PlayerPanelHost {
  settings: { rate: number; skipBackSeconds: number };
  isPointReadActive(): boolean;
  togglePointRead(): Promise<void>;
  saveSettings(): Promise<void>;
}

const RATES = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/** 纯控制面板：控制条 + 进度 + 当前句预览（点击定位正文）+ 点读模式开关 + 预生成。 */
export class PlayerPanelView extends ItemView {
  // 不能叫 titleEl：ES2022 类字段会以 define 语义遮蔽 View 基类同名属性（标题栏元素），
  // 导致 View.load() 里 this.titleEl.setText 读到 undefined
  private panelTitleEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private previewEl!: HTMLElement;
  private playBtn!: HTMLElement;
  private stopBtn!: HTMLElement;
  private prevBtn!: HTMLElement;
  private nextBtn!: HTMLElement;
  private seekBackBtn!: HTMLElement;
  private rateSel!: HTMLSelectElement;
  private pregenBtn!: HTMLElement;
  private pointReadBtn!: HTMLElement;

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
    this.onState();
  }

  override async onClose(): Promise<void> {
    this.unsubState?.();
    this.unsubCurrent?.();
    this.unsubState = null;
    this.unsubCurrent = null;
  }

  private buildDom(): void {
    const root = this.contentEl.createDiv('va-root');

    const header = root.createDiv('va-header');
    this.panelTitleEl = header.createDiv('va-title');
    this.panelTitleEl.setText(t('player.display-name'));

    const toolbar = root.createDiv('va-toolbar');

    this.prevBtn = toolbar.createDiv('va-btn');
    setIcon(this.prevBtn, 'skip-back');
    this.prevBtn.ariaLabel = t('player.prev');
    this.prevBtn.addEventListener('click', () => this.player.prev());

    this.playBtn = toolbar.createDiv('va-btn');
    setIcon(this.playBtn, 'play');
    this.playBtn.ariaLabel = t('player.play-pause');
    this.playBtn.addEventListener('click', () => {
      if (this.player.isPlaying()) this.player.pause();
      else this.player.play();
    });

    this.stopBtn = toolbar.createDiv('va-btn');
    setIcon(this.stopBtn, 'square');
    this.stopBtn.ariaLabel = t('player.stop');
    this.stopBtn.addEventListener('click', () => this.player.stop());

    this.nextBtn = toolbar.createDiv('va-btn');
    setIcon(this.nextBtn, 'skip-forward');
    this.nextBtn.ariaLabel = t('player.next');
    this.nextBtn.addEventListener('click', () => this.player.next());

    this.seekBackBtn = toolbar.createDiv('va-btn');
    setIcon(this.seekBackBtn, 'rewind');
    this.seekBackBtn.ariaLabel = t('player.seek-back', { n: this.host.settings.skipBackSeconds });
    this.seekBackBtn.addEventListener('click', () => this.player.seekBack());

    this.progressEl = toolbar.createDiv('va-progress');
    this.progressEl.setText('0 / 0');

    toolbar.createDiv('va-toolbar-spacer');

    this.rateSel = toolbar.createEl('select') as HTMLSelectElement;
    this.rateSel.addClass('va-select');
    this.rateSel.ariaLabel = t('player.rate');
    for (const r of RATES) {
      const o = this.rateSel.createEl('option');
      o.value = String(r);
      o.setText(`${r}x`);
      if (Math.abs(r - this.host.settings.rate) < 0.01) o.selected = true;
    }
    this.rateSel.addEventListener('change', async () => {
      this.host.settings.rate = parseFloat(this.rateSel.value);
      this.player.setRate(this.host.settings.rate);
      await this.host.saveSettings();
    });

    // 整篇预生成：点了就不等合成；生成中再点 = 停止
    this.pregenBtn = toolbar.createDiv('va-btn va-pregen-btn');
    setIcon(this.pregenBtn, 'audio-waveform');
    this.pregenBtn.ariaLabel = t('player.pregen');
    this.pregenBtn.addEventListener('click', () => void this.player.pregenerateAll());

    // 点读模式开关（进入 = 自动切阅读视图 + 句子可点击）
    this.pointReadBtn = toolbar.createDiv('va-btn va-pointread-btn');
    setIcon(this.pointReadBtn, 'pointer');
    this.pointReadBtn.ariaLabel = t('player.point-read');
    this.pointReadBtn.addEventListener('click', async () => {
      await this.host.togglePointRead();
      this.onState();
    });

    // 当前句预览：点击定位到正文对应位置
    this.previewEl = root.createDiv('va-preview');
    this.previewEl.ariaLabel = t('player.locate');
    this.previewEl.setText(t('player.open-hint'));
    this.previewEl.addEventListener('click', () => {
      const u = this.player.currentUnit();
      if (!u) return;
      const el = document.querySelector(`.va-sent[data-va="${u.id}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    this.statusEl = root.createDiv('va-status');
  }

  setNoteTitle(title: string): void {
    this.panelTitleEl.setText(title || t('player.display-name'));
  }

  refresh(): void {
    this.onState();
  }

  private onState(): void {
    const s: PlayerState = this.player.getState();
    setIcon(this.playBtn, s.paused ? 'play' : 'pause');
    this.progressEl.setText(
      `${s.currentIdx >= 0 ? s.currentIdx + 1 : 0} / ${s.total}` +
        (s.loading ? ` · ${t('player.synthesizing')}` : ''),
    );
    this.seekBackBtn.ariaLabel = t('player.seek-back', { n: this.host.settings.skipBackSeconds });

    const u = this.player.currentUnit();
    if (u) {
      this.previewEl.setText(u.text);
      this.previewEl.addClass('va-preview-live');
    } else {
      this.previewEl.setText(s.total ? t('player.open-hint') : t('player.no-content'));
      this.previewEl.removeClass('va-preview-live');
    }

    this.statusEl.setText(
      s.pregenActive
        ? t('player.pregen-running', { done: s.pregenDone, total: s.pregenTotal })
        : s.total
          ? t('player.unit-count', { total: s.total })
          : t('player.no-content'),
    );

    // 预生成按钮：进行中显示进度并可取消；不支持的引擎置灰
    this.pregenBtn.empty();
    if (s.pregenActive) {
      this.pregenBtn.setText(`${s.pregenDone}/${s.pregenTotal}`);
      this.pregenBtn.addClass('va-btn-active');
    } else {
      setIcon(this.pregenBtn, 'audio-waveform');
      this.pregenBtn.removeClass('va-btn-active');
    }

    // 点读模式按钮状态
    this.pointReadBtn.toggleClass('va-btn-on', this.host.isPointReadActive());
  }
}
