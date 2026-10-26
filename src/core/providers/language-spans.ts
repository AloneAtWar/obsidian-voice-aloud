/**
 * 中英混排文本的「书写系统分段」——为 SSML 的 <lang xml:lang> 语言域提供切点。
 *
 * 为什么需要：Azure 的数字/符号文本规范化（TN）跟随 <speak xml:lang>，而该值通常由
 * 音色名推导。中文音色念英文句子时，句中的 "50" 会按中文读成「五十」。把外文片段用
 * <lang xml:lang="en-US"> 包起来，TN 才按英文展开成 fifty。
 *
 * 切分规则（按书写系统分段，数字/标点/空白跟随邻居）：
 * - 汉字/假名/谚文 → cjk；拉丁字母 → latin；其余（数字、标点、空白）→ 中性
 * - 中性段含数字时优先归属其后的拉丁片段（"50 percent" 的 50 属于英文），
 *   否则归属前一段（"第 50 名" 的 50 属于中文）；没有前段时归属后一段
 * - 相邻同类段合并——一次切换只产生一个 <lang>，避免逐词切换造成的韵律抖动
 */

/** 书写系统：cjk（表意文字/假名/谚文）、latin（拉丁字母）。 */
export type Script = 'cjk' | 'latin';

export interface ScriptSegment {
  /** null = 整段没有任何可判定文字（只有数字/标点/空白），不需要语言域。 */
  script: Script | null;
  text: string;
}

/** 汉字（含扩展 A/兼容区）、平假名、片假名、谚文（音节与字母）、CJK 部首。 */
const CJK_CHAR =
  /[\u1100-\u11ff\u2e80-\u2eff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

/** 拉丁字母（含带变音符的扩展区），不含数字。 */
const LATIN_CHAR = /[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02af\u1e00-\u1eff]/;

/** 数字（阿拉伯-印度数字、阿拉伯文数字、波斯数字、全角数字）。 */
const DIGIT_CHAR = /[0-9\u0660-\u0669\u06f0-\u06f9\uff10-\uff19]/;

/** 单个字符的书写系统；数字/标点/空白/符号返回 null（中性）。 */
export function scriptOf(ch: string): Script | null {
  if (CJK_CHAR.test(ch)) return 'cjk';
  if (LATIN_CHAR.test(ch)) return 'latin';
  return null;
}

/** 分组用的字符类别：在书写系统之外单独分出「数字」——数字的归属要单独判定。 */
type CharKind = Script | 'digit' | null;

function charKind(ch: string): CharKind {
  const s = scriptOf(ch);
  if (s) return s;
  return DIGIT_CHAR.test(ch) ? 'digit' : null;
}

/**
 * 把文本切成书写系统片段（片段拼接 == 原文，不做任何清洗）。
 * 全中性文本返回单个 script=null 片段；单一语言文本返回单个片段。
 */
export function segmentByScript(text: string): ScriptSegment[] {
  const chars = [...text];
  if (!chars.length) return [];
  const kinds = chars.map(charKind);
  if (!kinds.some((k) => k === 'cjk' || k === 'latin')) {
    return [{ script: null, text }];
  }

  // 按「原始类别」粗分组：同类相邻字符合并（数字自成一类，不与标点混在一起）
  interface Raw {
    kind: CharKind;
    text: string;
  }
  const raw: Raw[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = raw[raw.length - 1];
    if (last && last.kind === kinds[i]) last.text += chars[i];
    else raw.push({ kind: kinds[i], text: chars[i] });
  }

  // 最近的确切语种段（跳过数字与中性段）
  const nearestRaw = (from: number, step: 1 | -1): Script | null => {
    for (let j = from; j >= 0 && j < raw.length; j += step) {
      const k = raw[j].kind;
      if (k === 'cjk' || k === 'latin') return k;
    }
    return null;
  };

  // 第一遍：数字段归属。后面紧跟拉丁字母时归英文（"50 percent" 的 50 属于英文），
  // 否则跟随前文（"第 50 名" 的 50 属于中文）。标点/空白留到第二遍。
  const digits: (Script | null)[] = raw.map((seg, i) => {
    if (seg.kind === 'cjk' || seg.kind === 'latin') return seg.kind;
    if (seg.kind !== 'digit') return null;
    const prev = nearestRaw(i - 1, -1);
    const next = nearestRaw(i + 1, 1);
    return next === 'latin' ? 'latin' : (prev ?? next);
  });

  // 第二遍：标点/空白跟随最近已定归属的段（此时数字已解析，可被跟随），
  // 这样 "：" 留在中文、"50" 之后的空格跟英文，不会把同一段外文切成两半。
  const resolved: (Script | null)[] = digits.map((s, i) => {
    if (s !== null) return s;
    for (let j = i - 1; j >= 0; j--) if (digits[j]) return digits[j];
    for (let j = i + 1; j < digits.length; j++) if (digits[j]) return digits[j];
    return null;
  });

  // 合并相邻同类（分段后可能产生 script 相同的连续段）
  const out: ScriptSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const script = resolved[i];
    const last = out[out.length - 1];
    if (last && last.script === script) last.text += raw[i].text;
    else out.push({ script, text: raw[i].text });
  }
  return out;
}

/** locale 的原生书写系统：中日韩/粤语 → cjk，其余 → latin。 */
export function nativeScript(locale: string): Script {
  return /^(zh|ja|ko|yue)/i.test((locale ?? '').trim()) ? 'cjk' : 'latin';
}

/** 非原生书写系统片段使用的语言域。 */
export function foreignLocale(script: Script): string {
  return script === 'cjk' ? 'zh-CN' : 'en-US';
}

/**
 * 按书写系统给文本套 <lang xml:lang> 语言域，返回已转义的 SSML 内联片段。
 *
 * - 文本与音色同语种：与未套语言域时**完全一致**（不产生任何标签）
 * - 整句都是外文（如中文音色念独立的英文例句）：整句包一个语言域，数字随该语言读
 * - 混排：仅外文片段被包裹，中文留在域外
 * - 外文片段首尾空白留在域外（避免域首空格影响韵律）
 * - escape：调用方的 XML 转义函数（各段文本在拼接前分别转义，标签本身不转义）
 */
export function wrapLanguageSpans(
  text: string,
  baseLocale: string,
  escape: (s: string) => string,
): string {
  const base = nativeScript(baseLocale);
  const segs = segmentByScript(text);
  if (!segs.length) return escape(text);
  const foreign = (seg: ScriptSegment): boolean => seg.script !== null && seg.script !== base;
  if (!segs.some(foreign)) return escape(text);
  return segs
    .map((seg) => {
      if (!foreign(seg)) return escape(seg.text);
      const lead = /^\s*/.exec(seg.text)?.[0] ?? '';
      const trail = /\s*$/.exec(seg.text)?.[0] ?? '';
      const core = seg.text.slice(lead.length, seg.text.length - trail.length);
      if (!core) return escape(seg.text);
      return (
        escape(lead) +
        `<lang xml:lang="${foreignLocale(seg.script as Script)}">${escape(core)}</lang>` +
        escape(trail)
      );
    })
    .join('');
}
