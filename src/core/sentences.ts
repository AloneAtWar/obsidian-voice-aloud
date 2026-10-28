import { sha256Hex } from '../util/hash';

export interface ReadingUnit {
  /** 句子身份 = hash(规范句文本)。原文改动 → 文本变 → id 变 → 点击定位/缓存/续播精确对齐 */
  id: string;
  /** 同 id（重复文本）在文档中的第几个出现（0 起，按文档顺序）：高亮/点击/续播据此锁定具体某一句 */
  occurrence: number;
  text: string;
  kind: 'heading' | 'text';
  heading: string | null;
  level: number;
}

/** buildUnits 的内容开关：代码块与表格默认跳过（保持既有行为）。 */
export interface BuildUnitsOptions {
  /** 朗读围栏代码块（一行一个单元，原文不清洗） */
  code?: boolean;
  /** 朗读表格（每个单元格按段落切句） */
  tables?: boolean;
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

/**
 * 按「软换行 + 句界标点」精确切分（片段拼接 == 原文）。
 * 渲染后的段落文本里，源码连续行以 \n 分隔（软换行）；解析侧按行切句，
 * 标注侧必须同样把 \n 当作切分点，两侧句子才能一一对齐——
 * 否则多行段落（如英文信件 4 行连写）里的句子拿不到 span（无高亮），
 * 而「每行一个单词」的词表也会被合并成超长句。
 */
export function splitLinesExact(text: string): string[] {
  if (!text.includes('\n')) return splitParagraphExact(text);
  const out: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const seg = i === lines.length - 1 ? lines[i] : lines[i] + '\n';
    if (!seg.trim()) {
      if (seg) out.push(seg);
      continue;
    }
    const pieces = splitParagraphExact(seg);
    if (!pieces.length) {
      out.push(seg);
      continue;
    }
    // splitParagraphExact 会丢弃尾部纯空白：把剩余字符补到最后一片，保证严格分区（按长度切分不错位）
    const used = pieces.reduce((n, p) => n + p.length, 0);
    if (used < seg.length) pieces[pieces.length - 1] += seg.slice(used);
    out.push(...pieces);
  }
  return out;
}

/** 与渲染后文本对齐：去 wikilink/markdown 链接外壳、加粗与斜体标记、列表前缀与任务勾选框。
 *  keepInlineCode=false（阅读代码关闭，默认）时行内代码整段剔除（如词表单词后的注音不朗读）；
 *  为 true 时保留代码内容（仅去反引号），与「阅读代码」开关一致。 */
export function cleanInlineMarkdown(line: string, keepInlineCode = false): string {
  return (
    line
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) =>
        b !== undefined ? b : a,
      )
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // 行内代码：渲染后反引号消失（变成 <code>）；关闭阅读代码时连内容一起剔除
      .replace(/`([^`]*)`/g, (_m, code: string) => (keepInlineCode ? code : ''))
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      // 任务列表项：列表前缀连同勾选框语法一起去掉（渲染后的 checkbox 元素不含文本，留着就对不上）
      .replace(/^\s*(?:[-*+]|\d+[.、])\s+\[[ xX]\]\s+/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+[.、]\s+/, '')
  );
}

/** 拆表格行：去首尾 |，按未转义 | 切格，\\| 转为字面 |。 */
export function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** 分隔行（| --- | :--: |）：只含短横/冒号，朗读时跳过。 */
export function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/** 构建朗读单元序列（整篇笔记；标题也作为单元朗读，跳过表格/嵌入；引用剥前缀照常朗读）。
 *  options.code：围栏代码块按行朗读（一行一个单元，原文不清洗）。
 *  options.tables：表格按单元格朗读（跳过分隔行，单元格按段落切句）。
 *  两者默认关闭（与既有行为一致）。 */
export async function buildUnits(
  md: string,
  options: BuildUnitsOptions = {},
): Promise<ReadingUnit[]> {
  const includeCode = options.code === true;
  const includeTables = options.tables === true;
  const body = stripFrontmatter(md);
  if (!body) return [];
  const units: ReadingUnit[] = [];
  // 同 id 句子的出现序号（文档顺序）：重复文本也各有唯一 (id, occurrence)
  const seen = new Map<string, number>();
  const push = async (
    text: string,
    kind: 'heading' | 'text',
    heading: string | null,
    level: number,
  ): Promise<void> => {
    const id = await sha256Hex(canonText(text));
    const occurrence = seen.get(id) ?? 0;
    seen.set(id, occurrence + 1);
    units.push({ id, occurrence, text, kind, heading, level });
  };
  let heading: string | null = null;
  let level = 2;
  let inFence = false;
  // 主题分隔线（--- / *** / ___）不是内容，不产生朗读单元
  const THEMATIC_BREAK = /^(?:-{3,}|\*{3,}|_{3,})$/;
  for (const rawLine of body.split('\n')) {
    const raw = rawLine.trim();
    // 代码围栏内部整行跳过；开合围栏线都可能带 > 前缀（引用内围栏），故剥前缀后再判断
    if (inFence) {
      if (raw.replace(/^(?:\s*>)+\s*/, '').startsWith('```')) {
        inFence = false;
        continue;
      }
      // 阅读代码开启：代码行原文成为一个朗读单元（不清洗 markdown、不按标点断句）
      if (includeCode && raw) {
        await push(raw, 'text', heading, level);
      }
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
        await push(text, 'heading', null, level);
      }
      continue;
    }
    // 表格：开启阅读表格时逐格切句（分隔行跳过）；关闭时整行跳过
    if (line.startsWith('|')) {
      if (!includeTables) continue;
      const cells = splitTableRow(line);
      if (isTableSeparator(cells)) continue;
      for (const cell of cells) {
        const clean = cleanInlineMarkdown(cell, includeCode);
        for (const piece of splitParagraphExact(clean)) {
          const text = piece.trim();
          if (text) await push(text, 'text', heading, level);
        }
      }
      continue;
    }
    if (!line || line.startsWith('!') || THEMATIC_BREAK.test(line)) {
      continue;
    }
    // 按行切句：一行一句（词表「每行一个单词」天然一单词一句，有无注音都一样）。
    // 渲染侧把连续行合并成一个 <p>，标注侧用 splitLinesExact 把软换行也当切分点，两边严格对齐。
    const clean = cleanInlineMarkdown(line, includeCode);
    for (const piece of splitParagraphExact(clean)) {
      const text = piece.trim();
      if (text) {
        await push(text, 'text', heading, level);
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

const normForMatch = (s: string): string => canonText(s).replace(/\s+/g, ' ').trim();

/** 块文本（可能跨多个单元）是否以某单元文本结尾：前一个兄弟块 ↔ 候选的前一个单元。 */
export function textEndsWith(blockText: string, unitText: string): boolean {
  const b = normForMatch(unitText);
  return !!b && normForMatch(blockText).endsWith(b);
}

/** 块文本（可能跨多个单元）是否以某单元文本开头：后一个兄弟块 ↔ 候选的后一个单元。 */
export function textStartsWith(blockText: string, unitText: string): boolean {
  const b = normForMatch(unitText);
  return !!b && normForMatch(blockText).startsWith(b);
}

/** 块文本是否包含某单元文本（跨块边界时的弱匹配，用于加深窗口）。 */
export function textContains(blockText: string, unitText: string): boolean {
  const b = normForMatch(unitText);
  return b.length >= 4 && normForMatch(blockText).includes(b);
}

/** 上下文匹配计分（点击定位与高亮定位共用）。
 *  prevBlocks/nextBlocks：前后各若干内容块文本（由近到远）；
 *  expPrev/expNext：候选前后各若干单元的期望文本（由近到远）。
 *  近邻强匹配（前块以期望前单元结尾 / 后块以期望后单元开头）+3；
 *  更远的期望单元只要出现在任一块文本中 +1——年度 boilerplate 相同（如都以 "(10 points)" 结尾）
 *  时，更深的窗口总能靠真正有区别的句子（如各年不同的 Directions 原文）打破平局。 */
export function blockMatchScore(
  prevBlocks: readonly string[] = [],
  nextBlocks: readonly string[] = [],
  expPrev: readonly string[] = [],
  expNext: readonly string[] = [],
): number {
  let s = 0;
  const p0 = prevBlocks[0] ?? '';
  const n0 = nextBlocks[0] ?? '';
  if (p0 && expPrev[0] && textEndsWith(p0, expPrev[0])) s += 3;
  if (n0 && expNext[0] && textStartsWith(n0, expNext[0])) s += 3;
  const normBlocks = [...prevBlocks, ...nextBlocks].map(normForMatch);
  for (let d = 1; d < expPrev.length; d++) {
    const t = normForMatch(expPrev[d] ?? '');
    if (t.length >= 4 && normBlocks.some((b) => b.includes(t))) s += 1;
  }
  for (let d = 1; d < expNext.length; d++) {
    const t = normForMatch(expNext[d] ?? '');
    if (t.length >= 4 && normBlocks.some((b) => b.includes(t))) s += 1;
  }
  return s;
}

/** 上下文窗口深度：向前/后各看多少个单元。 */
const CTX_DEPTH = 6;

/** 取 units[i] 前后各 CTX_DEPTH 个单元的文本（由近到远，跳过空）。 */
export function neighborUnitTexts(
  units: readonly ReadingUnit[],
  i: number,
): { prev: string[]; next: string[] } {
  const prev: string[] = [];
  const next: string[] = [];
  for (let d = 1; d <= CTX_DEPTH && i - d >= 0; d++) prev.push(units[i - d].text);
  for (let d = 1; d <= CTX_DEPTH && i + d < units.length; d++) next.push(units[i + d].text);
  return { prev, next };
}

/** 定位重复句所需的上下文：目标句文本 + 前后各若干内容块的文本（由近到远）。 */
export interface LocateContext {
  text: string;
  prevBlocks?: string[];
  nextBlocks?: string[];
}

/**
 * 用「前后文」在单元序列中定位句子——重复文本（如全文 34 处「参考作文」）不会错：
 * 候选 = 规范文本匹配的单元，按 blockMatchScore 打分；平分取离 hint 最近者
 * （hint 一般为文档序 occurrence 推出的单元下标）。无候选返回 -1。
 */
export function locateUnit(units: ReadingUnit[], ctx: LocateContext, hint = -1): number {
  const target = normForMatch(ctx.text);
  if (!target) return -1;
  const prevBlocks = ctx.prevBlocks ?? [];
  const nextBlocks = ctx.nextBlocks ?? [];
  let best = -1;
  let bestScore = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < units.length; i++) {
    if (normForMatch(units[i].text) !== target) continue;
    const nb = neighborUnitTexts(units, i);
    const score =
      1 + blockMatchScore(prevBlocks, nextBlocks, nb.prev, nb.next);
    const dist = hint >= 0 ? Math.abs(i - hint) : 0;
    if (score > bestScore || (score === bestScore && dist < bestDist)) {
      best = i;
      bestScore = score;
      bestDist = dist;
    }
  }
  return bestScore >= 1 ? best : -1;
}
