// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import type { Player } from '../src/core/player';
import { PlayerPanelView, type PlayerPanelHost } from '../src/ui/player-view';
import { t } from '../src/i18n';

beforeAll(() => {
  HTMLElement.prototype.empty = function (): void {
    this.replaceChildren();
  };
  HTMLElement.prototype.setText = function (text: string): void {
    this.textContent = text;
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

type CachePanel = {
  cacheSectionEl: HTMLDetailsElement;
  cacheMetaEl: HTMLElement;
  cacheListEl: HTMLElement;
  cacheSelectAllEl: HTMLInputElement;
  cacheClearBtn: HTMLButtonElement;
  cacheSelection: Set<string>;
  renderNoteCache(): Promise<void>;
  renderOptions(): Promise<void>;
  onState(): void;
};

it('切到无缓存笔记后重新展开面板，清空上一笔记的缓存行与统计', async () => {
  document.body.innerHTML = `
    <details open>
      <div class="meta">上一笔记：1 条缓存</div>
      <div class="list"><label>旧音色 <input type="checkbox" checked></label></div>
      <input class="select-all" type="checkbox" checked>
      <button>清理 1 项</button>
    </details>`;
  const view = new PlayerPanelView(
    new WorkspaceLeaf(),
    {} as Player,
    { noteCacheInfo: async () => [] } as unknown as PlayerPanelHost,
  );
  const panel = view as unknown as CachePanel;
  Object.assign(panel, {
    cacheSectionEl: document.querySelector('details'),
    cacheMetaEl: document.querySelector('.meta'),
    cacheListEl: document.querySelector('.list'),
    cacheSelectAllEl: document.querySelector('.select-all'),
    cacheClearBtn: document.querySelector('button'),
    cacheSelection: new Set(['old-account\u0000old-voice']),
  });
  vi.spyOn(panel, 'renderOptions').mockResolvedValue();
  vi.spyOn(panel, 'onState').mockImplementation(() => {});

  view.refresh();
  expect(panel.cacheSectionEl.open).toBe(false);
  panel.cacheSectionEl.open = true;
  await panel.renderNoteCache();

  expect(panel.cacheListEl.childElementCount).toBe(0);
  expect(panel.cacheMetaEl.textContent).toBe(t('player.cache-empty'));
  expect(panel.cacheSelectAllEl.checked).toBe(false);
  expect(panel.cacheClearBtn.disabled).toBe(true);
  expect(panel.cacheSelection.size).toBe(0);
});
