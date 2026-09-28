import { sha256Hex } from '../../util/hash';

export interface AudioKeyFields {
  accountId: string;
  providerId: string;
  model?: string;
  voice: string;
  language: string;
  text: string;
}

/**
 * 音频缓存键 = hash(账号+供应商+模型+音色+语言+句子文本)。
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
      f.text,
    ].join('\u0000'),
  );
}
