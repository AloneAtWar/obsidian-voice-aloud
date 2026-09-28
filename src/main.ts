import { Notice, Plugin, TFile, WorkspaceLeaf, debounce } from 'obsidian';
import { DEFAULT_SETTINGS, resolveActive, type VoiceAloudSettings } from './core/accounts';
import {
  NoteHighlighter,
  registerAnnotationPostProcessor,
  wrapAllReadingViews,
} from './core/annotation';
import { IndexedDbAudioStorage } from './core/cache/indexeddb';
import { Player } from './core/player';
import { PointReadMode } from './core/point-read';
import { buildUnits, UnitIndex } from './core/sentences';
import { t } from './i18n';
import { PlayerPanelView, VIEW_TYPE_VOICE_ALOUD, type PlayerPanelHost } from './ui/player-view';
import { VoiceAloudSettingTab, type SettingsTabHost } from './ui/settings-tab';

export default class VoiceAloudPlugin extends Plugin {
  override settings: VoiceAloudSettings = DEFAULT_SETTINGS;
  storage = new IndexedDbAudioStorage();
  player!: Player;
  pointRead!: PointReadMode;
  highlighter = new NoteHighlighter();
  private unitIndex: UnitIndex | null = null;
  private activeFile: TFile | null = null;
  private panelHost!: PlayerPanelHost;

  override async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.player = new Player({
      storage: this.storage,
      getVoice: () => resolveActive(this.settings),
      getRate: () => this.settings.rate,
      getSkipBackSeconds: () => this.settings.skipBackSeconds,
      getNotePath: () => this.activeFile?.path ?? null,
      getNoteTitle: () => this.activeFile?.basename ?? '',
    });

    this.panelHost = {
      settings: this.settings,
      isPointReadActive: () => this.pointRead.active,
      togglePointRead: () => this.togglePointRead(),
      saveSettings: () => this.saveSettings(),
    };

    this.pointRead = new PointReadMode(this, {
      onChange: (active) => {
        new Notice(active ? t('player.point-read-on') : t('player.point-read-off'));
        this.refreshPlayerViews();
      },
    });

    this.registerView(
      VIEW_TYPE_VOICE_ALOUD,
      (leaf: WorkspaceLeaf) => new PlayerPanelView(leaf, this.player, this.panelHost),
    );

    this.addRibbonIcon('headphones', 'Voice Aloud', () => void this.activateView());

    this.addCommand({
      id: 'open-panel',
      name: t('command.open-panel'),
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: 'toggle-play',
      name: t('command.toggle-play'),
      callback: () => {
        if (this.player.isPlaying()) this.player.pause();
        else {
          void this.activateView();
          this.player.play();
        }
      },
    });
    this.addCommand({ id: 'stop', name: t('command.stop'), callback: () => this.player.stop() });
    this.addCommand({ id: 'next', name: t('command.next'), callback: () => this.player.next() });
    this.addCommand({ id: 'prev', name: t('command.prev'), callback: () => this.player.prev() });
    this.addCommand({
      id: 'seek-back',
      name: t('command.seek-back', { n: this.settings.skipBackSeconds }),
      callback: () => this.player.seekBack(),
    });
    this.addCommand({
      id: 'point-read',
      name: t('command.point-read'),
      callback: () => void this.togglePointRead(),
    });

    this.addSettingTab(new VoiceAloudSettingTab(this.app, this.settingTabHost()));

    // 正文（阅读视图）句子标注 + 播放高亮
    registerAnnotationPostProcessor(this, () => this.unitIndex);
    this.player.onCurrent((id) => this.highlighter.setActive(id));

    // 点读模式下的点击朗读（事件委托；样式由 body.va-point-read 控制）
    this.registerDomEvent(document, 'click', (ev: MouseEvent) => {
      if (!this.pointRead.active) return;
      const target = ev.target as HTMLElement | null;
      const span = target?.closest?.('.va-sent') as HTMLElement | null;
      if (span && span.dataset.va) this.player.playFromId(span.dataset.va);
    });

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        void this.reloadActive(file);
      }),
    );
    // 布局变化（切视图/切阅读模式/开新窗格）后补包装 + 点读模式退出检测
    const wrapDebounced = debounce(() => this.wrapPreviewSentences(), 600, true);
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.pointRead.handleContextChange();
        wrapDebounced();
      }),
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.pointRead.handleContextChange();
        wrapDebounced();
      }),
    );
    const reloadChanged = debounce(
      (file: TFile) => {
        if (file === this.activeFile) void this.reloadActive(file);
      },
      800,
      true,
    );
    this.registerEvent(this.app.metadataCache.on('changed', reloadChanged));

    // 笔记改名/删除 → 维护音频缓存的归属
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          void this.storage.renameNote(oldPath, file.path);
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          void this.storage.removeNote(file.path);
        }
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      void this.reloadActive(this.app.workspace.getActiveFile());
    });
  }

  /** 面板宿主接口（避免 UI 与 main 循环引用）。 */
  private settingTabHost(): SettingsTabHost {
    return {
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      getStorage: () => this.storage,
      refreshPlayerViews: () => this.refreshPlayerViews(),
    };
  }

  async togglePointRead(): Promise<void> {
    await this.pointRead.toggle();
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_VOICE_ALOUD)[0] || null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_VOICE_ALOUD, active: true });
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  refreshPlayerViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VOICE_ALOUD)) {
      const v = leaf.view;
      if (v instanceof PlayerPanelView) {
        v.setNoteTitle(this.activeFile?.basename ?? t('player.display-name'));
        v.refresh();
      }
    }
  }

  private async reloadActive(file: TFile | null): Promise<void> {
    this.activeFile = file;
    let md: string | null = null;
    if (file && file.extension === 'md') {
      try {
        md = await this.app.vault.cachedRead(file);
      } catch {
        md = null;
      }
    }
    // 播放中刷新：按当前句 id 在新句子集中续播（句子未变则无缝继续）
    const resumeId = this.player.getState().playing
      ? (this.player.currentUnit()?.id ?? null)
      : null;
    const units = md !== null ? await buildUnits(md) : [];
    this.unitIndex = new UnitIndex(units);
    this.player.setNote(units, { title: file?.basename ?? '', path: file?.path ?? null });
    if (resumeId) {
      const idx = units.findIndex((u) => u.id === resumeId);
      if (idx >= 0) this.player.playFromIndex(idx);
    }
    this.refreshPlayerViews();
    // 句子索引就绪后重渲染阅读视图：否则首次渲染发生在索引加载前，正文不会被标注
    this.rerenderPreviews();
    // 渲染完成后主动包装句子（不依赖后处理器语义，结果可验证）
    window.setTimeout(() => this.wrapPreviewSentences(), 300);
  }

  wrapPreviewSentences(): void {
    const n = wrapAllReadingViews(() => this.unitIndex);
    if (n > 0) console.log(`[voice-aloud] 已包装 ${n} 个段落`);
    // 若当前正在播放，补一次当前句高亮
    const cur = this.player.currentUnit();
    if (cur) this.highlighter.setActive(cur.id);
  }

  rerenderPreviews(): void {
    try {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view as { previewMode?: { rerender?: (b: boolean) => void } };
        if (v && v.previewMode && typeof v.previewMode.rerender === 'function') {
          v.previewMode.rerender(true);
        }
      });
    } catch (e) {
      console.warn('[voice-aloud] rerender previews failed', e);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  override onunload(): void {
    this.player.dispose();
    this.pointRead.exit();
    this.storage.close();
  }
}
