/** TTS 供应商层的统一契约：所有适配器实现此接口，注册进 registry。 */

export interface SynthesizeInput {
  text: string;
  voice: string;
  language: string;
}

export interface SynthesizeResult {
  data: ArrayBuffer;
  mime: string;
}

export interface ProviderCapabilities {
  /** 合成结果可落缓存（Web Speech 为 false：拿不到音频字节） */
  cacheable: boolean;
  /** 支持整篇预生成 */
  pregeneratable: boolean;
  /** 支持从端点拉取音色列表 */
  voiceList: boolean;
  /** 直接语音合成路径（不经音频数据，如 Web Speech） */
  direct: boolean;
}

/** 用户添加的供应商实例（provider = 供应商类型，account = 一套配置）。 */
export interface TtsAccountConfig {
  id: string;
  name: string;
  providerId: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  voice: string;
  language: string;
  /** 供应商私有选项，如 MiMo 的风格指令 */
  extra?: Record<string, string>;
}

export interface HttpRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  json?: unknown;
  arrayBuffer?: ArrayBuffer;
  text?: string;
  headers?: Record<string, string>;
}

/** HTTP 函数可注入：生产走 obsidian requestUrl，测试注入假实现。 */
export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>;

export interface HealthResult {
  ok: boolean;
  message?: string;
}

export interface TtsProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** 新账号的默认字段（不含 id/name）。 */
  defaults(): Partial<TtsAccountConfig>;
  listVoices(account: TtsAccountConfig, http?: HttpFn): Promise<string[]>;
  checkHealth?(account: TtsAccountConfig, http?: HttpFn): Promise<HealthResult>;
  synthesize(
    account: TtsAccountConfig,
    input: SynthesizeInput,
    http?: HttpFn,
  ): Promise<SynthesizeResult>;
  /** direct 供应商：直接合成播放。 */
  speakDirect?(
    text: string,
    opts: { rate: number; language: string },
    onEnd: () => void,
    onError: (message: string) => void,
  ): void;
  cancelDirect?(): void;
}

export const LANGUAGES = ['Chinese', 'English', 'Japanese', 'Korean', 'Auto'] as const;
