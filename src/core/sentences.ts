import { sha256Hex } from '../util/hash';

export interface ReadingUnit {
  /** 句子身份 = hash(规范句文本)。原文改动 → 文本变 → id 变 → 点击定位/缓存/续播精确对齐 */
  id: string;
  text: string;
  kind: 'heading' | 'text';
  heading: string | null;
  level: number;
}

/** 句子文本的规范形式：抹平渲染引入的排版字符差异（弯引号/省略号）。 */
export function canonText(text: string): string {
  return text
    .replace(/[“”„「」]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...');
}

/** 去掉 frontmatter。 */
export function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/** 拉丁单词字符：字母、数字、撇号（直/弯）。切点两侧都是单词字符即意味着单词会被切断。 */
const LATIN_WORD_CHAR = /[A-Za-z0-9'’]/;

/**
 * 把 80 字硬切点从拉丁单词内部挪到最近的单词边界，避免 from 被切成 fr/om：
 * - 优先向前找空格（且不留下过短碎片）；找不到再向后找；
 * - 两者都没有（超长无空格串，如 URL）时保持原切点——那种场景只能断。
 * 中日韩字符不受影响：CJK 任意两点间断行都是正常排版。
 */
function wordSafeCut(buf: string, cut: number): number {
  if (cut <= 0 || cut >= buf.length) return cut;
  if (!LATIN_WORD_CHAR.test(buf[cut - 1]) || !LATIN_WORD_CHAR.test(buf[cut])) return cut;
  const prevSpace = buf.lastIndexOf(' ', cut - 1);
  if (prevSpace > 30) return prevSpace + 1;
  const nextSpace = buf.indexOf(' ', cut);
  if (nextSpace !== -1 && nextSpace <= 120) return nextSpace + 1;
  return cut;
}

/** 常见英文缩写（小写）：这些词后的句点不当句界，避免 Mr./e.g./Fig. 被误切 */
const EN_ABBREVIATIONS = new Set([
  // 称谓与头衔
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'rev', 'hon', 'pres', 'gov', 'sen', 'rep',
  'jr', 'sr', 'st', 'capt', 'col', 'lt', 'sgt', 'gen',
  // 学术与文献
  'eg', 'ie', 'etc', 'cf', 'al', 'vs', 'fig', 'figs', 'eq', 'eqs', 'ref', 'refs',
  'vol', 'vols', 'no', 'nos', 'pp', 'ch', 'sec', 'approx', 'dept', 'univ',
  'inc', 'ltd', 'co', 'corp',
  // 星期与月份
  'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  // 常用度量
  'min', 'max', 'avg', 'sq', 'ft', 'lb', 'lbs', 'oz', 'km', 'cm', 'mm', 'kg',
  'phd', 'md', 'ba', 'bs', 'ma',
]);

/** 句界标点后可跟随的右引号/右括号：切分时一并归入前一片，避免 '"' 孤零到下片 */
const EN_CLOSERS = /[)\]}"'’”»「」]/;

/**
 * 判断 text[i] 处的 '.' 是否为英文句界：
 * - 后须跟空白、结尾或右引号/右括号（排除 3.14、example.com、e.g, 等词内点）；
 * - 省略号结尾（...）算句界；
 * - 前词为单字母（J.、i.e. 的后半）或常见缩写时不算。
 * 非字母字符（右引号/括号）先剥掉再取前词，"stop."、don't. 才能正确断句。
 */
function isEnSentenceEnd(text: string, i: number): boolean {
  const next = text[i + 1];
  if (next !== undefined && !/[\s)\]}"'’”»「」]/.test(next)) return false;
  if (text.slice(i - 2, i) === '..') return true;
  const prefix = text.slice(0, i).replace(/[^A-Za-z]+$/, '');
  const word = /([A-Za-z]+(?:['’][A-Za-z]+)*)$/.exec(prefix)?.[1] ?? '';
  if (word.length <= 1) return false;
  return !EN_ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * 精确切分段落文本为句子片段（片段拼接 == 原文，不做任何清洗）。
 * 正文标注与 TTS 断句共用此函数，保证两侧句子一致。
 * 句界：。！？!?；; 与英文句点 .（缩写/小数点/省略号/词内点不拆）；
 * 超长（>80字）在逗号处二切；无逗号可切的硬切避让拉丁单词边界。
 */
export function splitParagraphExact(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  const push = () => {
    if (buf.trim()) {
      out.push(buf);
    }
    buf = '';
  };
  // 英文句点优先断句：buf 内从左到右找安全句点切开（含紧随的右引号/括号），
  // 剩下的无句界长文才交给 80 字兜底——英文按句子切，不按定长切
  const flushEnglish = () => {
    for (;;) {
      let i = buf.indexOf('.');
      while (i !== -1 && !isEnSentenceEnd(buf, i)) i = buf.indexOf('.', i + 1);
      if (i === -1) return;
      let end = i + 1;
      while (end < buf.length && EN_CLOSERS.test(buf[end])) end++;
      out.push(buf.slice(0, end));
      buf = buf.slice(end);
    }
  };
  // 不用 lookbehind（iOS < 16.4 的 Safari 不支持），用逐段匹配得到同样的切分；
  // 句界标点后允许跟随右引号/右括号（"stop!" 整体归前一片）
  for (const m of text.matchAll(
    /[^。！？!?；;]*[。！？!?；;][)\]}"'’”»「」]*|[^。！？!?；;]+/g,
  )) {
    const seg = m[0];
    buf += seg;
    flushEnglish();
    if (/[。！？!?；;][)\]}"'’”»]*\s*$/.test(seg)) {
      push();
      continue;
    }
    while (buf.length > 80) {
      const m = buf.slice(0, 80).lastIndexOf('，');
      const cut = wordSafeCut(buf, m > 30 ? m + 1 : 80);
      out.push(buf.slice(0, cut));
      buf = buf.slice(cut);
    }
  }
  push();
  return out;
}

/** 与渲染后文本对齐：去 wikilink/markdown 链接外壳、加粗与斜体标记、列表前缀与任务勾选框。 */
export function cleanInlineMarkdown(line: string): string {
  return (
    line
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) =>
        b !== undefined ? b : a,
      )
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      // 任务列表项：列表前缀连同勾选框语法一起去掉（渲染后的 checkbox 元素不含文本，留着就对不上）
      .replace(/^\s*(?:[-*+]|\d+[.、])\s+\[[ xX]\]\s+/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.、]\s+/, '')
  );
}

/** 构建朗读单元序列（整篇笔记；标题也作为单元朗读，跳过表格/代码/嵌入；引用剥前缀照常朗读）。 */
export async function buildUnits(md: string): Promise<ReadingUnit[]> {
  const body = stripFrontmatter(md);
  if (!body) return [];
  const units: ReadingUnit[] = [];
  let heading: string | null = null;
  let level = 2;
  let inFence = false;
  for (const rawLine of body.split('\n')) {
    const raw = rawLine.trim();
    // 代码围栏内部整行跳过；开合围栏线都可能带 > 前缀（引用内围栏），故剥前缀后再判断
    if (inFence) {
      if (raw.replace(/^(?:\s*>)+\s*/, '').startsWith('```')) inFence = false;
      continue;
    }
    let line = raw;
    if (line.startsWith('>')) {
      // 引用：剥掉 > 前缀（含嵌套）与 callout 类型标记，正文/自定义标题照常朗读
      line = line.replace(/^(?:\s*>)+\s*/, '').replace(/^\[![^\]]*[-+]?\]\s*/, '');
    }
    if (line.startsWith('```')) {
      inFence = true;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+?)\s*(?:%%t=[\d.]+%%)?\s*$/);
    if (h) {
      heading = h[2];
      level = h[1].length;
      const text = heading.trim();
      if (text) {
        units.push({
          id: await sha256Hex(canonText(text)),
          text,
          kind: 'heading',
          heading: null,
          level,
        });
      }
      continue;
    }
    if (!line || line.startsWith('|') || line.startsWith('!')) {
      continue;
    }
    const clean = cleanInlineMarkdown(line);
    for (const piece of splitParagraphExact(clean)) {
      const text = piece.trim();
      if (text) {
        units.push({
          id: await sha256Hex(canonText(text)),
          text,
          kind: 'text',
          heading,
          level,
        });
      }
    }
  }
  return units;
}

/**
 * 句子文本 → 单元 的同步查表索引。
 * DOM 标注侧不做哈希（post-processor 必须同步），按规范文本直接查表即可对齐 id。
 */
export class UnitIndex {
  private byText = new Map<string, ReadingUnit>();

  constructor(units: ReadingUnit[]) {
    for (const u of units) {
      this.byText.set(canonText(u.text), u);
    }
  }

  findByText(text: string): ReadingUnit | undefined {
    return this.byText.get(canonText(text.trim()));
  }
}
