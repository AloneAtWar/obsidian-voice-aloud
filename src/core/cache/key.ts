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
 * 音频缓存键 = hash(账号+供应商+模型+音色+语言+额外参数+句子文本[+区域][+请求体版本])。
 * 换任一维度 → 键变 → 自动重新合成；语速不参与（播放端变速，不影响音频内容）。
 *
 * 字段序列的前 8 项与 1.0.3 逐字节一致，region / synthesisRevision 只在有值时
 * **追加**为带前缀的独立字段：没有这两个维度的供应商（OpenAI / Qwen / MiMo）
 * 升级后缓存键不变，旧音频与离线预生成内容继续命中；否则无条件插入空字段会多出
 * 一个 NUL 分隔符，等于把所有人的既有缓存一次性作废。
 */
export async function audioCacheKey(f: AudioKeyFields): Promise<string> {
  const parts = [
    'voice-aloud-audio-v1',
    f.accountId,
    f.providerId,
    f.model ?? '',
    f.voice,
    f.language,
    f.extra ?? '',
    f.text,
  ];
  // 带 key= 前缀，避免与相邻字段的取值产生拼接歧义
  if (f.region) parts.push(`region=${f.region}`);
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
