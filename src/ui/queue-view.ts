import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type { PregenQueue, QueueTask } from '../core/pregen-queue';
import { t } from '../i18n';

export const VIEW_TYPE_VOICE_ALOUD_QUEUE = 'voice-aloud-queue-view';

/** 队列视图对宿主的最小依赖（避免与 main.ts 循环引用）。 */
export interface QueueViewHost {
  openNote(notePath: string): void;
  confirm(message: string): boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

const STATUS_KEY: Record<QueueTask['status'], string> = {
  waiting: 'queue.status-waiting',
  running: 'queue.status-running',
  done: 'queue.status-done',
  partial: 'queue.status-partial',
  cancelled: 'queue.status-cancelled',
  expired: 'queue.status-expired',
};

/**
 * 预生成队列视图：全局启停 + 总进度 + 任务列表（行内进度/取消/重试/置顶/上下移）。
 * 状态事件驱动整体重绘：任务数量以十计，全量重建的代价可忽略。
 */
export class PregenQueueView extends ItemView {
  private stateTextEl!: HTMLElement;
  private toggleRunBtn!: HTMLButtonElement;
  private overallBarEl!: HTMLElement;
  private overallTextEl!: HTMLElement;
  private metaEl!: HTMLElement;
  private listEl!: HTMLElement;
  private unsub: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private queue: PregenQueue,
    private host: QueueViewHost,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_VOICE_ALOUD_QUEUE;
  }

  override getDisplayText(): string {
    return t('queue.view-name');
  }

  override getIcon(): string {
    return 'list-todo';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('va-view');
    this.buildDom();
    this.unsub = this.queue.onState(() => this.render());
    this.render();
  }

  override async onClose(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
  }

  private buildDom(): void {
    const root = this.contentEl.createDiv('va-queue');

    // 控制区：运行状态 + 启动/暂停 + 停止 + 清空已完成
    const controls = root.createDiv('va-queue-controls');
    this.stateTextEl = controls.createDiv('va-queue-state');
    const buttons = controls.createDiv('va-queue-buttons');
    this.toggleRunBtn = this.iconBtn(buttons, 'play', t('queue.start'), () => {
      if (this.queue.snapshot().running) this.queue.pause();
      else this.queue.start();
    });
    this.iconBtn(buttons, 'square', t('queue.stop'), () => {
      if (!this.host.confirm(t('queue.confirm-stop'))) return;
      this.queue.stopAll();
    });
    this.iconBtn(buttons, 'eraser', t('queue.clear-finished'), () => this.queue.clearFinished());

    // 总进度
    const overall = root.createDiv('va-queue-overall');
    const bar = overall.createDiv('va-queue-overall-bar');
    this.overallBarEl = bar.createDiv('va-queue-overall-fill');
    this.overallTextEl = overall.createDiv('va-queue-overall-text');
    this.metaEl = overall.createDiv('va-queue-meta');

    this.listEl = root.createDiv('va-queue-list');
  }

  private render(): void {
    const s = this.queue.snapshot();

    // 控制区状态
    if (s.running) {
      this.stateTextEl.setText(t('queue.state-running'));
      this.stateTextEl.className = 'va-queue-state is-running';
    } else if (s.pauseReason === 'failures') {
      this.stateTextEl.setText(t('queue.state-paused-failures'));
      this.stateTextEl.className = 'va-queue-state is-failure';
    } else {
      this.stateTextEl.setText(t('queue.state-paused'));
      this.stateTextEl.className = 'va-queue-state';
    }
    this.toggleRunBtn.empty();
    setIcon(this.toggleRunBtn, s.running ? 'pause' : 'play');
    this.toggleRunBtn.ariaLabel = s.running ? t('queue.pause') : t('queue.start');

    // 总进度：未终结任务的 done/total 合计
    const active = s.tasks.filter((task) => task.status === 'waiting' || task.status === 'running');
    const done = active.reduce((sum, task) => sum + task.done, 0);
    const total = active.reduce((sum, task) => sum + task.total, 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this.overallBarEl.style.width = `${pct}%`;
    this.overallTextEl.setText(total > 0 ? `${done}/${total} · ${pct}%` : '—');
    const parts = [t('queue.pending-count', { n: active.length })];
    if (s.generatedBytes > 0)
      parts.push(t('queue.generated-bytes', { size: formatBytes(s.generatedBytes) }));
    const failed = s.tasks.reduce((sum, task) => sum + task.failed, 0);
    if (failed > 0) parts.push(t('queue.failed-count', { n: failed }));
    this.metaEl.setText(parts.join(' · '));

    // 任务列表
    this.listEl.empty();
    if (!s.tasks.length) {
      this.listEl.createDiv({ text: t('queue.empty'), cls: 'va-queue-empty' });
      return;
    }
    for (const task of s.tasks) this.renderTask(task);
  }

  private renderTask(task: QueueTask): void {
    const row = this.listEl.createDiv(`va-queue-row is-${task.status}`);

    const top = row.createDiv('va-queue-row-top');
    const title = top.createDiv('va-queue-note');
    title.setText(task.noteTitle || task.notePath);
    title.ariaLabel = t('queue.open-note');
    title.addEventListener('click', () => this.host.openNote(task.notePath));

    const statusEl = top.createSpan(`va-queue-status is-${task.status}`);
    statusEl.setText(t(STATUS_KEY[task.status]));

    const actions = top.createDiv('va-queue-actions');
    this.addTaskActions(actions, task);

    const bottom = row.createDiv('va-queue-row-bottom');
    const config = bottom.createDiv('va-queue-config');
    config.setText(`${task.accountName} · ${task.voice}`);
    const bar = bottom.createDiv('va-queue-row-bar');
    const fill = bar.createDiv('va-queue-row-fill');
    const pct = task.total > 0 ? Math.round((task.done / task.total) * 100) : 0;
    fill.style.width = `${pct}%`;
    const progressText = bottom.createDiv('va-queue-row-count');
    progressText.setText(
      task.total > 0
        ? `${task.done}/${task.total}`
        : task.status === 'waiting' || task.status === 'running'
          ? '…'
          : '—',
    );
    if (task.lastError) {
      row.createDiv('va-queue-error').setText(task.lastError);
    }
  }

  private addTaskActions(parent: HTMLElement, task: QueueTask): void {
    if (task.status === 'waiting' || task.status === 'running') {
      this.iconBtn(parent, 'arrow-up-to-line', t('queue.promote'), () =>
        this.queue.promote(task.id),
      );
      this.iconBtn(parent, 'chevron-up', t('queue.move-up'), () => this.queue.move(task.id, -1));
      this.iconBtn(parent, 'chevron-down', t('queue.move-down'), () => this.queue.move(task.id, 1));
      this.iconBtn(parent, 'x', t('queue.cancel'), () => this.queue.cancelTask(task.id));
    } else if (task.status === 'partial') {
      this.iconBtn(parent, 'rotate-ccw', t('queue.retry'), () => this.queue.retryTask(task.id));
    }
  }

  private iconBtn(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = parent.createEl('button', 'va-queue-icon-btn');
    setIcon(btn, icon);
    btn.ariaLabel = label;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
