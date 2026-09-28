import { App, ButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import { Notice } from 'obsidian';
import type { AudioStorage, CacheOwner, CacheStats, NoteCacheInfo } from '../core/cache/storage';
import { getProvider } from '../core/providers/registry';
import { AccountModal } from './account-modal';
import { t } from '../i18n';

export interface SettingsTabHost {
  settings: import('../core/accounts').VoiceAloudSettings;
  saveSettings(): Promise<void>;
  storage: AudioStorage;
  refreshPlayerViews(): void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function ownerLabel(owner: CacheOwner): string {
  return `${owner.accountName} · ${owner.voice}`;
}

export class VoiceAloudSettingTab extends PluginSettingTab {
  private host: SettingsTabHost;
  /** 缓存配置过滤：'' = 全部；格式 accountId\u0000voice */
  private cacheFilter = '';

  constructor(app: App, plugin: import('obsidian').Plugin & SettingsTabHost) {
    // PluginSettingTab 构造函数会读 plugin.manifest.name/id，必须传真实插件实例
    super(app, plugin);
    this.host = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderPlaybackSection(containerEl);
    this.renderAccountsSection(containerEl);
    this.renderCacheSection(containerEl.createDiv());
  }

  /** 播放参数（语速恒为 1x 起步、面板 −/+ 调节；账号/音色在播放器面板上选择）。 */
  private renderPlaybackSection(root: HTMLElement): void {
    new Setting(root).setName(t('settings.playback')).setHeading();

    const valueEl = root.createDiv('va-setting-hint');
    const syncValue = () => {
      valueEl.setText(t('settings.skip-back-value', { n: this.host.settings.skipBackSeconds }));
    };
    syncValue();
    new Setting(root)
      .setName(t('settings.skip-back'))
      .setDesc(t('settings.skip-back-desc'))
      .addSlider((s) =>
        s
          .setLimits(1, 60, 1)
          .setValue(this.host.settings.skipBackSeconds)
          .onChange(async (v: number) => {
            this.host.settings.skipBackSeconds = v;
            syncValue();
            await this.host.saveSettings();
            this.host.refreshPlayerViews();
          }),
      );
  }

  private renderAccountsSection(root: HTMLElement): void {
    new Setting(root)
      .setName(t('settings.accounts'))
      .setDesc(t('settings.accounts-desc'))
      .setHeading();

    if (!this.host.settings.accounts.length) {
      root.createDiv({ text: t('settings.no-accounts'), cls: 'va-setting-hint' });
    }
    for (const acc of this.host.settings.accounts) {
      const provider = getProvider(acc.providerId);
      new Setting(root)
        .setName(acc.name || acc.id)
        .setDesc(
          `${provider?.name ?? acc.providerId} · ${t('settings.default-voice')}: ${acc.voice}`,
        )
        .addButton((b: ButtonComponent) =>
          b.setButtonText(t('settings.edit')).onClick(() => {
            new AccountModal(this.app, acc, async (saved) => {
              const idx = this.host.settings.accounts.findIndex((a) => a.id === saved.id);
              if (idx >= 0) this.host.settings.accounts[idx] = saved;
              await this.host.saveSettings();
              this.host.refreshPlayerViews();
              this.display();
            }).open();
          }),
        )
        .addButton((b: ButtonComponent) =>
          b.setButtonText(t('settings.delete')).onClick(async () => {
            if (!window.confirm(`${t('settings.delete')}「${acc.name}」？`)) return;
            this.host.settings.accounts = this.host.settings.accounts.filter(
              (a) => a.id !== acc.id,
            );
            if (this.host.settings.activeAccountId === acc.id) {
              this.host.settings.activeAccountId = null;
            }
            delete this.host.settings.voiceByAccount[acc.id];
            await this.host.saveSettings();
            this.host.refreshPlayerViews();
            this.display();
          }),
        );
    }

    new Setting(root).addButton((b: ButtonComponent) =>
      b
        .setCta()
        .setButtonText(t('settings.add-account'))
        .onClick(() => {
          new AccountModal(this.app, null, async (saved) => {
            this.host.settings.accounts.push(saved);
            await this.host.saveSettings();
            this.host.refreshPlayerViews();
            this.display();
          }).open();
        }),
    );
  }

  private renderCacheSection(container: HTMLElement): void {
    new Setting(container)
      .setName(t('settings.cache'))
      .setDesc(t('settings.cache-desc'))
      .setHeading();

    // 配置过滤（全部 / 账号·音色）
    const filterRow = container.createDiv('va-cache-filter');
    filterRow.createSpan({ text: t('settings.cache-config-filter'), cls: 'va-cache-filter-label' });
    const filterSel = filterRow.createEl('select', 'va-cache-filter-select dropdown');
    filterSel.addEventListener('change', () => {
      this.cacheFilter = filterSel.value;
      void this.renderCacheData(container);
    });

    container.createDiv('va-cache-list');
    container.createDiv('va-setting-hint');
    void this.renderCacheData(container);
  }

  private async renderCacheData(container: HTMLElement): Promise<void> {
    const storage = this.host.storage;
    const all: NoteCacheInfo[] = await storage.listByNote();

    // 重建过滤下拉（renderCacheData 会被反复调用）
    const filterSel = container.querySelector<HTMLSelectElement>('.va-cache-filter-select');
    if (filterSel) {
      const owners = new Map<string, CacheOwner>();
      for (const info of all) {
        owners.set(`${info.owner.accountId}\u0000${info.owner.voice}`, info.owner);
      }
      filterSel.empty();
      filterSel.createEl('option', { value: '', text: t('settings.cache-all-configs') });
      for (const [key, owner] of owners) {
        filterSel.createEl('option', { value: key, text: ownerLabel(owner) });
      }
      filterSel.value = this.cacheFilter;
    }

    // 统计：过滤后合计
    const filtered = this.cacheFilter
      ? all.filter((n) => `${n.owner.accountId}\u0000${n.owner.voice}` === this.cacheFilter)
      : all;
    const statsEl = container.querySelector('.va-setting-hint');
    if (statsEl) {
      const stats: CacheStats = {
        entries: filtered.reduce((s, n) => s + n.entries, 0),
        bytes: filtered.reduce((s, n) => s + n.bytes, 0),
      };
      statsEl.setText(
        t('settings.cache-stats', { entries: stats.entries, size: formatBytes(stats.bytes) }),
      );
    }

    const listEl = container.querySelector('.va-cache-list');
    if (!listEl) return;
    listEl.empty();
    if (!filtered.length) {
      listEl.createDiv({ text: t('settings.cache-empty'), cls: 'va-setting-hint' });
    }
    for (const note of filtered) {
      const row = listEl.createDiv('va-cache-row');
      const pathEl = row.createDiv({ cls: 'va-cache-note-path' });
      pathEl.createDiv({ text: note.notePath, cls: 'va-cache-note-name' });
      pathEl.createDiv({ text: ownerLabel(note.owner), cls: 'va-cache-note-owner' });
      row.createDiv({
        text: `${formatBytes(note.bytes)} · ${note.entries} · ${new Date(note.updatedAt).toLocaleString()}`,
        cls: 'va-cache-note-meta',
      });
      const btn = row.createDiv('va-cache-clear-btn');
      btn.setText(t('settings.cache-clear-note'));
      btn.addEventListener('click', async () => {
        const label = `${note.notePath} · ${ownerLabel(note.owner)}`;
        if (!window.confirm(t('settings.cache-confirm-note', { note: label }))) return;
        const n = await storage.removeNote(note.notePath, note.owner);
        new Notice(t('settings.cache-cleared', { n }));
        void this.renderCacheData(container);
      });
    }

    // 刷新/全部清空按钮（renderCacheData 会被反复调用，先清掉旧实例）
    container.querySelectorAll('.va-cache-actions').forEach((el) => el.remove());
    const actions = new Setting(container);
    actions.settingEl.addClass('va-cache-actions');
    actions
      .addButton((b: ButtonComponent) =>
        b.setButtonText(t('settings.cache-refresh')).onClick(() => this.display()),
      )
      .addButton((b: ButtonComponent) =>
        b.setButtonText(t('settings.cache-clear-all')).onClick(async () => {
          if (!window.confirm(t('settings.cache-confirm-all'))) return;
          await storage.clearAll();
          this.display();
        }),
      );
  }
}
