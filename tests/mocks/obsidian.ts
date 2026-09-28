/**
 * Vitest 用的 obsidian 模块替身。
 * src/ 里 import 自 'obsidian' 的符号都在这里提供最小实现，
 * 通过 vitest.config.ts 的 resolve.alias 生效。
 */

export interface MockHttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  throw?: boolean;
}

export interface MockHttpResponse {
  status: number;
  json?: unknown;
  arrayBuffer?: ArrayBuffer;
  text?: string;
}

type RequestHandler = (req: MockHttpRequest) => MockHttpResponse | Promise<MockHttpResponse>;

let handler: RequestHandler | null = null;

export function __setRequestHandler(fn: RequestHandler | null): void {
  handler = fn;
}

export async function requestUrl(req: MockHttpRequest): Promise<MockHttpResponse> {
  if (!handler) throw new Error('No mock requestUrl handler set (call __setRequestHandler)');
  return handler(req);
}

export class Notice {
  constructor(
    public message: unknown,
    public _duration?: number,
  ) {}
}

export class Plugin {
  app: unknown = {};
  manifest = { id: 'voice-aloud', version: '0.0.0' };
  async loadData(): Promise<unknown> {
    return null;
  }
  async saveData(_data: unknown): Promise<void> {}
  addCommand(cmd: unknown): unknown {
    return cmd;
  }
  addRibbonIcon(..._args: unknown[]): unknown {
    return null;
  }
  registerEvent(): void {}
  registerDomEvent(): void {}
  registerMarkdownPostProcessor(): void {}
  registerView(): void {}
  addSettingTab(): void {}
}

export class ItemView {
  app: unknown = {};
  constructor(public leaf: unknown) {}
  getContentEl(): HTMLElement {
    return {} as HTMLElement;
  }
}

export class PluginSettingTab {
  app: unknown = {};
  containerEl: HTMLElement = {} as HTMLElement;
  constructor(_app: unknown, _plugin: unknown) {}
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(public _containerEl: unknown) {}
  setName(): this {
    return this;
  }
  setDesc(): this {
    return this;
  }
  addText(): this {
    return this;
  }
  addDropdown(): this {
    return this;
  }
  addToggle(): this {
    return this;
  }
  addButton(): this {
    return this;
  }
}

export class Modal {
  app: unknown = {};
  contentEl: HTMLElement = {} as HTMLElement;
  open(): void {}
  close(): void {}
}

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  _timeout = 0,
  _resetTimer = false,
): T {
  return fn;
}

export function setIcon(_el: unknown, _icon: string): void {}

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = 'md';
}

export class MarkdownView {
  file: TFile | null = null;
  getMode(): 'source' | 'preview' {
    return 'preview';
  }
}

export class WorkspaceLeaf {
  view: unknown = null;
}

export class Workspace {
  getActiveFile(): TFile | null {
    return null;
  }
}
