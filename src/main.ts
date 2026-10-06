import { Notice, Plugin, TFile, TFolder, WorkspaceLeaf, debounce } from 'obsidian';
import { DEFAULT_SETTINGS, resolveActive, type VoiceAloudSettings } from './core/accounts';
import {
  NoteHighlighter,
  registerAnnotationPostProcessor,
  wrapAllReadingViews,
} from './core/annotation';
import { IndexedDbAudioStorage } from './core/cache/indexeddb';
import { PointReadMode } from './core/point-read';
import { PregenQueue, type QueuePersistData } from './core/pregen-queue';
import { Player } from './core/player';
import { getProvider } from './core/providers/registry';
import { SynthService } from './core/synth-service';
import { buildUnits, UnitIndex } from './core/sentences';
import { randomId } from './util/hash';
import { t } from './i18n';
import { PlayerPanelView, VIEW_TYPE_VOICE_ALOUD, type PlayerPanelHost } from './ui/player-view';
import { PregenQueueView, VIEW_TYPE_VOICE_ALOUD_QUEUE } from './ui/queue-view';
import { VoiceAloudSettingTab } from './ui/settings-tab';

/** data.json 顶层形态：设置字段 + 队列持久化（pregenQueue）。 */
type PersistedData = VoiceAloudSettings & { pregenQueue?: QueuePersistData };

export default class VoiceAloudPlugin extends Plugin {
  override settings: VoiceAloudSettings = DEFAULT_SETTINGS;
  storage = new IndexedDbAudioStorage();
  synth = new SynthService(this.storage);
  player!: Player;
  queue!: PregenQueue;
  pointRead!: PointReadMode;
  highlighter = new NoteHighlighter();
  private unitIndex: UnitIndex | null = null;
  private activeFile: TFile | null = null;
  private panelHost!: PlayerPanelHost;
  private queueWasRunning = false;
  private wasPlaybackActive = false;
  private persistQueueDebounced = debounce(
    () => void this.saveData(this.buildPersistedData()),
    800,
    true,
  );

  override async onload(): Promise<void> {
    const raw = (await this.loadData()) as PersistedData | null;
    const { pregenQueue: queueData, ...settingsRaw } = raw ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsRaw);

    this.player = new Player({
      synth: this.synth,
      getVoice: () => resolveActive(this.settings),
      getRate: () => this.settings.rate,
      getSkipBackSeconds: () => this.settings.skipBackSeconds,
      getNotePath: () => this.activeFile?.path ?? null,
      getNoteTitle: () => this.activeFile?.basename ?? '',
    });

    this.queue = new PregenQueue({
      storage: this.storage,
      synth: this.synth,
      getAccount: (id) => this.settings.accounts.find((a) => a.id === id),
      canPregenerate: (account) =>
        getProvider(account.providerId)?.capabilities.pregeneratable === true,
      readNote: async (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return null;
        try {
          return await this.app.vault.cachedRead(f);
        } catch {
          return null;
        }
      },
      getConcurrencySettings: () => ({
        localTtsTotal: this.settings.localTtsTotalConcurrency,
        playbackBehavior: this.settings.playbackQueueBehavior,
      }),
      isPlaybackActive: () => this.player.isPlaying(),
      notify: (message) => {
        if (this.settings.queueNotify) new Notice(message);
      },
      persist: () => this.persistQueueDebounced(),
      newId: () => randomId('task'),
    });
    this.queueWasRunning = this.queue.restore(queueData);

    this.panelHost = {
      settings: this.settings,
      isPointReadActive: () => this.pointRead.active,
      togglePointRead: () => this.togglePointRead(),
      isFollowReadActive: () => this.settings.followRead,
      toggleFollowRead: async () => {
        this.settings.followRead = !this.settings.followRead;
        await this.saveSettings();
        new Notice(
          this.settings.followRead ? t('player.follow-read-on') : t('player.follow-read-off'),
        );
        // 命令路径也刷新面板按钮状态
        this.player.notifyExternal();
      },
      accountOptions: () => [
        { id: '', label: t('player.system-voice') },
        ...this.settings.accounts.map((a) => ({
          id: a.id,
          label: a.name || a.id,
        })),
      ],
      currentAccountId: () => this.settings.activeAccountId,
      setCurrentAccount: async (id) => {
        this.settings.activeAccountId = id;
        await this.saveSettings();
        this.player.notifyExternal();
      },
      currentVoice: () => resolveActive(this.settings).account?.voice ?? '',
      setCurrentVoice: async (voice) => {
        const id = this.settings.activeAccountId;
        if (id && voice) {
          this.settings.voiceByAccount[id] = voice;
          await this.saveSettings();
          this.player.notifyExternal();
        }
      },
      voicesForCurrentAccount: async () => {
        const { provider, account } = resolveActive(this.settings);
        if (!account) return [];
        try {
          return await provider.listVoices(account);
        } catch {
          return [];
        }
      },
      saveSettings: () => this.saveSettings(),
      enqueueCurrentNote: () => this.enqueueActiveNote(),
      openQueueView: () => void this.activateQueueView(),
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
    this.registerView(VIEW_TYPE_VOICE_ALOUD_QUEUE, (leaf: WorkspaceLeaf) => {
      return new PregenQueueView(leaf, this.queue, {
        openNote: (path) => {
          const f = this.app.vault.getAbstractFileByPath(path);
          if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
        },
        confirm: (message) => window.confirm(message),
      });
    });

    this.addRibbonIcon('headphones', 'Voice Aloud', () => void this.activateView());

    this.addCommand({
      id: 'open-panel',
      name: t('command.open-panel'),
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: 'open-queue',
      name: t('command.open-queue'),
      callback: () => void this.activateQueueView(),
    });
    this.addCommand({
      id: 'enqueue-current',
      name: t('command.enqueue-current'),
      callback: () => void this.enqueueActiveNote(),
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
      id: 'seek-forward',
      name: t('command.seek-forward', { n: this.settings.skipBackSeconds }),
      callback: () => this.player.seekForward(),
    });
    this.addCommand({
      id: 'point-read',
      name: t('command.point-read'),
      callback: () => void this.togglePointRead(),
    });
    this.addCommand({
      id: 'follow-read',
      name: t('command.follow-read'),
      callback: () => void this.panelHost.toggleFollowRead(),
    });

    this.addSettingTab(new VoiceAloudSettingTab(this.app, this));

    // 正文（阅读视图）句子标注 + 播放高亮（跟读模式开启时随读滚动）
    registerAnnotationPostProcessor(this, () => this.unitIndex);
    this.player.onCurrent((id) => this.highlighter.setActive(id, this.settings.followRead));
    // 播放启停 → 通知队列（'pause' 行为下恢复派发；'yield' 下无影响）
    this.player.onState(() => {
      const active = this.player.isPlaying();
      if (active !== this.wasPlaybackActive) {
        this.wasPlaybackActive = active;
        this.queue.notifyPlaybackChanged();
      }
    });

    // 文件/文件夹右键 → 加入预生成队列
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) =>
            item
              .setTitle(t('queue.file-menu'))
              .setIcon('audio-waveform')
              .onClick(() => void this.enqueueFiles([file])),
          );
        } else if (file instanceof TFolder) {
          menu.addItem((item) =>
            item
              .setTitle(t('queue.folder-menu'))
              .setIcon('audio-waveform')
              .onClick(() => {
                const prefix = file.path === '/' ? '' : `${file.path}/`;
                void this.enqueueFiles(
                  this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix)),
                );
              }),
          );
        }
      }),
    );

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

    // 笔记改名/删除 → 维护音频缓存与队列任务的归属
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          void this.storage.renameNote(oldPath, file.path);
          this.queue.renameNote(oldPath, file.path, file.basename);
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          void this.storage.removeNote(file.path);
          this.queue.removeNote(file.path);
        }
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      void this.reloadActive(this.app.workspace.getActiveFile());
      if (this.queueWasRunning && this.settings.autoResumeQueue) this.queue.start();
    });
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
    if (leaf) await workspace.revealLeaf(leaf);
  }

  async activateQueueView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_VOICE_ALOUD_QUEUE)[0] || null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_VOICE_ALOUD_QUEUE, active: true });
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  /** 把当前笔记加入预生成队列（面板按钮 / 命令）。 */
  async enqueueActiveNote(): Promise<void> {
    const file = this.activeFile;
    if (!file || file.extension !== 'md') {
      new Notice(t('queue.no-note'));
      return;
    }
    await this.enqueueFiles([file]);
  }

  /** 批量入队：身份 = 笔记 + 当前账号 + 当前面板音色（入队时快照）。 */
  async enqueueFiles(files: TFile[]): Promise<void> {
    const { provider, account } = resolveActive(this.settings);
    if (!account) {
      new Notice(t('queue.no-account'));
      return;
    }
    if (!provider.capabilities.pregeneratable) {
      new Notice(t('queue.not-pregeneratable'));
      return;
    }
    if (!files.length) {
      new Notice(t('queue.no-note'));
      return;
    }
    let added = 0;
    let dup = 0;
    for (const f of files) {
      const r = this.queue.enqueue(
        { path: f.path, title: f.basename },
        account.id,
        account.voice,
        account.name || account.id,
      );
      if (r === 'added') added++;
      else dup++;
    }
    if (added === 1 && dup === 0) {
      new Notice(t('queue.enqueued', { note: files[0].basename }));
    } else if (added === 0) {
      new Notice(t('queue.enqueue-duplicate', { note: files[0].basename }));
    } else {
      new Notice(t('queue.enqueue-batch', { n: added, skipped: dup }));
    }
  }

  onAccountsChanged(): void {
    this.queue.onAccountsChanged();
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
    if (cur) this.highlighter.setActive(cur.id, this.settings.followRead);
  }

  /** 实机诊断：用当前账号合成一句，返回完整错误信息（含堆栈）。 */
  async debugSynthesize(text: string): Promise<unknown> {
    const { provider, account } = resolveActive(this.settings);
    if (!account) return { ok: false, message: '当前为系统语音（无账号）' };
    const startedAt = Date.now();
    try {
      const r = await provider.synthesize(account, {
        text,
        voice: account.voice,
        language: account.language,
      });
      return { ok: true, bytes: r.data.byteLength, mime: r.mime, ms: Date.now() - startedAt };
    } catch (e) {
      return {
        ok: false,
        name: e instanceof Error ? e.name : typeof e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack?.slice(0, 800) : undefined,
        ms: Date.now() - startedAt,
      };
    }
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

  private buildPersistedData(): PersistedData {
    return { ...this.settings, pregenQueue: this.queue.persistData() };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.buildPersistedData());
  }

  override onunload(): void {
    this.queue.dispose();
    this.persistQueueDebounced.cancel();
    void this.saveData(this.buildPersistedData());
    this.player.dispose();
    this.pointRead.exit();
    this.storage.close();
    // 卸载时移除面板叶子：否则插件重载后残留旧视图实例（闭包指向旧 settings），
    // 面板上的账号/音色切换会写进旧对象、播放器读不到
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VOICE_ALOUD).forEach((l) => l.detach());
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VOICE_ALOUD_QUEUE).forEach((l) => l.detach());
  }
}
