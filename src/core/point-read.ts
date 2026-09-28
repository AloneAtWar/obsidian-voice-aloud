import { MarkdownView, type Plugin, type WorkspaceLeaf } from 'obsidian';

export interface WatchedViewInfo {
  /** 被追踪的 leaf 是否仍在 workspace 中（false = 已关闭/被替换） */
  leafExists: boolean;
  mode: 'source' | 'preview' | 'other';
}

/**
 * 点读模式退出判定（纯函数，便于单测）：
 * 退出 = 手动 toggle（调用方处理）、被追踪 leaf 消失（关闭笔记/换成非 markdown 视图）、
 * 或切回编辑模式。仍在阅读视图但换了笔记 → 保持（新模式跟随阅读行为）。
 */
export function shouldExitPointRead(active: boolean, watched: WatchedViewInfo | null): boolean {
  if (!active) return false;
  if (!watched) return true;
  if (!watched.leafExists) return true;
  return watched.mode !== 'preview';
}

/**
 * 点读模式：平时阅读视图完全无感；进入时自动切阅读视图并启用「点击句子开始朗读」，
 * 任一退出条件发生即恢复默认态。退出只移除交互样式，不停止播放。
 */
export class PointReadMode {
  private activeFlag = false;
  private watchedLeaf: WorkspaceLeaf | null = null;

  constructor(
    private plugin: Plugin,
    private opts: { onChange?: (active: boolean) => void } = {},
  ) {}

  get active(): boolean {
    return this.activeFlag;
  }

  async toggle(): Promise<void> {
    if (this.activeFlag) this.exit();
    else await this.enter();
  }

  private async enter(): Promise<void> {
    const workspace = this.plugin.app.workspace;
    const view = workspace.getActiveViewOfType(MarkdownView);
    // 没有打开的笔记就没有可点读的正文，静默不进入
    if (!view) return;
    const leaf: WorkspaceLeaf | null = view.leaf ?? null;
    if (!leaf) return;
    if (view.getMode() !== 'preview') {
      const state = view.getState();
      await leaf.setViewState({
        type: 'markdown',
        active: true,
        state: { ...state, mode: 'preview' },
      });
    }
    this.watchedLeaf = leaf;
    this.activeFlag = true;
    document.body.classList.add('va-point-read');
    this.opts.onChange?.(true);
  }

  exit(): void {
    if (!this.activeFlag) return;
    this.activeFlag = false;
    document.body.classList.remove('va-point-read');
    this.watchedLeaf = null;
    this.opts.onChange?.(false);
  }

  /** active-leaf-change / layout-change / file-open 后由 main 调用，检测自动退出条件。 */
  handleContextChange(): void {
    if (!this.activeFlag) return;
    let info: WatchedViewInfo | null = null;
    const leaf = this.watchedLeaf;
    if (leaf) {
      const stillThere = this.plugin.app.workspace.getLeavesOfType('markdown').includes(leaf);
      const view = leaf.view;
      const mode: WatchedViewInfo['mode'] =
        view instanceof MarkdownView
          ? view.getMode() === 'source'
            ? 'source'
            : 'preview'
          : 'other';
      info = { leafExists: stillThere, mode: stillThere ? mode : 'other' };
    }
    if (shouldExitPointRead(this.activeFlag, info)) this.exit();
  }
}
