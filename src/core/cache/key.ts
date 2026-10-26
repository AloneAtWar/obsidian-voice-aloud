import { sha256Hex } from '../../util/hash';

export interface AudioKeyFields {
  accountId: string;
  providerId: string;
  model?: string;
  voice: string;
  language: string;
  /** Azure 服务区域：变化 → 键变 → 重新合成（其他供应商为空，不影响键）。 */
  region?: string;
  /** 额外合成参数（如 MiMo 风格指令）：变化 → 键变 → 重新合成。 */
  extra?: string;
  /**
   * 供应商请求体形态版本（如 Azure SSML 的 <lang> 语言域）。
   * 仅在该供应商声明变更时追加进键，未声明的供应商键值保持不变（不会整体失效）。
   */
  synthesisRevision?: string;
  text: string;
}

/**
 * 音频缓存键 = hash(账号+供应商+模型+音色+语言+区域+额外参数+句子文本[+请求体版本])。
 * 换任一维度 → 键变 → 自动重新合成；语速不参与（播放端变速，不影响音频内容）。
 */
export async function audioCacheKey(f: AudioKeyFields): Promise<string> {
  const parts = [
    'voice-aloud-audio-v1',
    f.accountId,
    f.providerId,
    f.model ?? '',
    f.voice,
    f.language,
    f.region ?? '',
    f.extra ?? '',
    f.text,
  ];
  // 条件追加：未声明版本的供应商键与旧版本完全一致，避免无关缓存被连带失效
  if (f.synthesisRevision) parts.push(`rev=${f.synthesisRevision}`);
  return sha256Hex(parts.join('\u0000'));
}

/** 账号 extra 参数的规范字符串（键排序，保证等价对象产生相同字符串）。 */
export function canonicalExtra(extra: Record<string, string> | undefined): string | undefined {
  if (!extra) return undefined;
  const keys = Object.keys(extra).sort();
  if (!keys.length) return undefined;
  return keys.map((k) => `${k}=${extra[k]}`).join('&');
}
