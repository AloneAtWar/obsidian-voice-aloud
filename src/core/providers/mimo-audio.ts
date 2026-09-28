/**
 * Xiaomi MiMo TTS 纯函数层（chat-completions 音频形态）。
 * 移植自 AloneAtWar/obsidian-voice fork 的 src/service/mimoAudio.ts。
 * MiMo 只在 chat 意义上「OpenAI 兼容」：合成为 POST /v1/chat/completions 带 audio 字段，
 * 音频以 base64 返回在 choices[0].message.audio.data。
 */

export const MIMO_MODEL = 'mimo-v2.5-tts';
export const MIMO_DEFAULT_HOST = 'api.xiaomimimo.com';

export interface MimoChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MimoChatResponse {
  error?: { message?: string; type?: string; code?: string } | string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      audio?: {
        id?: string;
        data?: string;
        format?: string;
      };
    };
  }>;
}

export type MimoAudioResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/** 风格指令作 user 消息（不会被读出），正文作 assistant 消息。 */
export function buildMimoMessages(text: string, style?: string): MimoChatMessage[] {
  const messages: MimoChatMessage[] = [];
  const trimmedStyle = style?.trim();
  if (trimmedStyle) {
    messages.push({ role: 'user', content: trimmedStyle });
  }
  messages.push({ role: 'assistant', content: text });
  return messages;
}

/** chat-completions URL（Token Plan 与按量付费 host 共用同一路径）。 */
export function mimoEndpoint(host: string): string {
  const cleaned = (host || MIMO_DEFAULT_HOST).trim().replace(/\/+$/, '');
  return `https://${cleaned}/v1/chat/completions`;
}

/** base64 → bytes；容忍 data-URL 前缀与空白。 */
export function base64ToBytes(b64: string): Uint8Array {
  const stripped = b64.trim().replace(/\s/g, '');
  const comma = stripped.indexOf(',');
  const data = stripped.startsWith('data:') && comma !== -1 ? stripped.slice(comma + 1) : stripped;
  if (!data) throw new Error('Empty base64 audio data.');

  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new Error('Invalid base64 audio data.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.byteLength === 0) throw new Error('Empty base64 audio data.');
  return bytes;
}

/** 拷贝为独立 ArrayBuffer（可安全交给 Blob/播放）。 */
export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** 从 OpenAI 风格 JSON 错误体尽力提取错误文本。 */
export function mimoErrorMessageFrom(resp: MimoChatResponse): string {
  const err = resp.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object' && typeof err.message === 'string') return err.message;
  return '';
}

/** 解析 chat-completions 响应：返回音频字节或描述性错误。 */
export function extractMimoAudio(resp: MimoChatResponse): MimoAudioResult {
  const apiError = mimoErrorMessageFrom(resp);
  if (apiError) return { ok: false, error: apiError };

  const choice = resp.choices?.[0];
  if (choice?.finish_reason === 'content_filter') {
    return { ok: false, error: 'MiMo blocked the text (content filter).' };
  }
  const audioB64 = choice?.message?.audio?.data;
  if (!audioB64) return { ok: false, error: 'MiMo returned no audio.' };
  try {
    return { ok: true, bytes: base64ToBytes(audioB64) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid audio data.' };
  }
}
