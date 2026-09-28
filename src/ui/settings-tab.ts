import { App, ButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import { Notice } from 'obsidian';
import type { NoteCacheInfo, CacheStats } from '../core/cache/storage';
import { getProvider } from '../core/providers/registry';
import { AccountModal } from './account-modal';
import { t } from '../i18n';

export interface SettingsTabHost {
  settings: import('../core/accounts').VoiceAloudSettings;
  saveSettings(): Promise<void>;
  storage: import('../core/cache/storage').AudioStorage;
  refreshPlayerViews(): void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export class VoiceAloudSettingTab extends PluginSettingTab {
  private host: SettingsTabHost;

  constructor(app: App, plugin: import('obsidian').Plugin & SettingsTabHost) {
    // PluginSettingTab 构造函数会读 plugin.manifest.name/id，必须传真实插件实例
    super(app, plugin);
    this.host = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderVoiceSection(containerEl);
    this.renderAccountsSection(containerEl);
    this.renderCacheSection(containerEl.createDiv());
  }

  private renderVoiceSection(root: HTMLElement): void {
    new Setting(root)
      .setName(t('settings.current-voice'))
      .setDesc(t('settings.current-voice-desc'));

    new Setting(root).addDropdown((d) => {
      d.addOption('', t('settings.voice-system'));
      for (const acc of this.host.settings.accounts) {
        const label = getProvider(acc.providerId)?.name ?? acc.providerId;
        d.addOption(acc.id, `${acc.name}（${label}）`);
      }
      d.setValue(this.host.settings.activeAccountId ?? '');
      d.onChange(async (v) => {
        this.host.settings.activeAccountId = v || null;
        await this.host.saveSettings();
        this.host.refreshPlayerViews();
      });
    });

    new Setting(root)
      .setName(t('settings.rate'))
      .setDesc(t('settings.rate-desc'))
      .addDropdown((d) => {
        for (const r of [0.75, 1, 1.25, 1.5, 2, 2.5, 3]) {
          d.addOption(String(r), `${r}x`);
        }
        d.setValue(String(this.host.settings.rate));
        d.onChange(async (v) => {
          this.host.settings.rate = parseFloat(v);
          await this.host.saveSettings();
        });
      });

    new Setting(root)
      .setName(t('settings.skip-back'))
      .setDesc(t('settings.skip-back-desc'))
      .addText((txt) =>
        txt.setValue(String(this.host.settings.skipBackSeconds)).onChange(async (v) => {
          const n = Math.min(60, Math.max(1, parseInt(v, 10) || 15));
          if (String(n) !== v) txt.setValue(String(n));
          this.host.settings.skipBackSeconds = n;
          await this.host.saveSettings();
          this.host.refreshPlayerViews();
        }),
      );
  }

  private renderAccountsSection(root: HTMLElement): void {
    new Setting(root).setName(t('settings.accounts')).setDesc(t('settings.accounts-desc'));

    if (!this.host.settings.accounts.length) {
      root.createDiv({ text: t('settings.no-accounts'), cls: 'va-setting-hint' });
    }
    for (const acc of this.host.settings.accounts) {
      const provider = getProvider(acc.providerId);
      const isActive = this.host.settings.activeAccountId === acc.id;
      new Setting(root)
        .setName(`${isActive ? '● ' : ''}${acc.name}`)
        .setDesc(provider?.name ?? acc.providerId)
        .addButton((b: ButtonComponent) =>
          b.setButtonText(t('settings.edit')).onClick(() => {
            new AccountModal(this.app, acc, async (saved) => {
              const idx = this.host.settings.accounts.findIndex((a) => a.id === saved.id);
              if (idx >= 0) this.host.settings.accounts[idx] = saved;
              await this.host.saveSettings();
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
            this.display();
          }).open();
        }),
    );
  }

  private renderCacheSection(container: HTMLElement): void {
    new Setting(container).setName(t('settings.cache'));

    const listEl = container.createDiv('va-cache-list');
    const statsEl = container.createDiv('va-setting-hint');
    void this.renderCacheData(statsEl, listEl, container);
  }

  private async renderCacheData(
    statsEl: HTMLElement,
    listEl: HTMLElement,
    container: HTMLElement,
  ): Promise<void> {
    const storage = this.host.storage;
    const stats: CacheStats = await storage.stats();
    statsEl.setText(
      t('settings.cache-stats', { entries: stats.entries, size: formatBytes(stats.bytes) }),
    );

    listEl.empty();
    const notes: NoteCacheInfo[] = await storage.listByNote();
    if (!notes.length) {
      listEl.createDiv({ text: t('settings.cache-empty'), cls: 'va-setting-hint' });
    }
    for (const note of notes) {
      const row = listEl.createDiv('va-cache-row');
      row.createDiv({ text: note.notePath, cls: 'va-cache-note-path' });
      row.createDiv({
        text: `${formatBytes(note.bytes)} · ${note.entries} · ${new Date(note.updatedAt).toLocaleString()}`,
        cls: 'va-cache-note-meta',
      });
      const btn = row.createDiv('va-cache-clear-btn');
      btn.setText(t('settings.cache-clear-note'));
      btn.addEventListener('click', async () => {
        if (!window.confirm(t('settings.cache-confirm-note', { note: note.notePath }))) return;
        const n = await storage.removeNote(note.notePath);
        new Notice(t('settings.cache-cleared', { n }));
        void this.renderCacheData(statsEl, listEl, container);
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
