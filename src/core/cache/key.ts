import { sha256Hex } from '../../util/hash';

export interface AudioKeyFields {
  accountId: string;
  providerId: string;
  model?: string;
  voice: string;
  language: string;
  /** 额外合成参数（如 MiMo 风格指令）：变化 → 键变 → 重新合成。 */
  extra?: string;
  text: string;
}

/**
 * 音频缓存键 = hash(账号+供应商+模型+音色+语言+额外参数+句子文本)。
 * 换任一维度 → 键变 → 自动重新合成；语速不参与（播放端变速，不影响音频内容）。
 */
export async function audioCacheKey(f: AudioKeyFields): Promise<string> {
  return sha256Hex(
    [
      'voice-aloud-audio-v1',
      f.accountId,
      f.providerId,
      f.model ?? '',
      f.voice,
      f.language,
      f.extra ?? '',
      f.text,
    ].join('\u0000'),
  );
}

/** 账号 extra 参数的规范字符串（键排序，保证等价对象产生相同字符串）。 */
export function canonicalExtra(extra: Record<string, string> | undefined): string | undefined {
  if (!extra) return undefined;
  const keys = Object.keys(extra).sort();
  if (!keys.length) return undefined;
  return keys.map((k) => `${k}=${extra[k]}`).join('&');
}
