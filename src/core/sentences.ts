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

/**
 * 精确切分段落文本为句子片段（片段拼接 == 原文，不做任何清洗）。
 * 正文标注与 TTS 断句共用此函数，保证两侧句子一致。
 * 句界：。！？!?；;；超长（>80字）在逗号处二切。
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
  // 不用 lookbehind（iOS < 16.4 的 Safari 不支持），用逐段匹配得到同样的切分
  for (const m of text.matchAll(/[^。！？!?；;]*[。！？!?；;]|[^。！？!?；;]+/g)) {
    const seg = m[0];
    buf += seg;
    if (/[。！？!?；;]\s*$/.test(seg)) {
      push();
      continue;
    }
    while (buf.length > 80) {
      const m = buf.slice(0, 80).lastIndexOf('，');
      const cut = m > 30 ? m + 1 : 80;
      out.push(buf.slice(0, cut));
      buf = buf.slice(cut);
    }
  }
  push();
  return out;
}

/** 与渲染后文本对齐：去 wikilink/markdown 链接外壳、加粗与斜体标记、列表前缀。 */
export function cleanInlineMarkdown(line: string): string {
  return line
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) =>
      b !== undefined ? b : a,
    )
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.、]\s+/, '');
}

/** 构建朗读单元序列（整篇笔记；标题也作为单元朗读，跳过表格/代码/引用）。 */
export async function buildUnits(md: string): Promise<ReadingUnit[]> {
  const body = stripFrontmatter(md);
  if (!body) return [];
  const units: ReadingUnit[] = [];
  let heading: string | null = null;
  let level = 2;
  let inFence = false;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    // 代码围栏：``` 打开/关闭，围栏内部整行跳过
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
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
    if (!line || line.startsWith('|') || line.startsWith('>') || line.startsWith('!')) {
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
