import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import {
  blockMatchScore,
  splitLinesExact,
  type ReadingUnit,
  type UnitIndex,
} from './sentences';

/**
 * 正文句子标注（阅读视图）：
 * - 段落、列表项、表格单元格与 callout 标题按句包成 <span class="va-sent" data-va=id>
 *   （与 TTS 断句共用 splitParagraphExact）
 * - 阅读代码开启时，围栏代码块按行包装（保留词法高亮 token，与 buildUnits 的按行单元对齐）
 * - 引用（含 callout）内部的 p/li 由下方选择器自然覆盖
 * - 尽量保留内联格式（加粗/斜体/链接）；跨句的内联元素外壳会被拆开（仅丢失该处格式）
 * - 点击朗读由 main.ts 的事件委托处理（点读模式开启时）
 * - 播放高亮按「文档序位置」匹配：同文本第 N 个 span（文档序）= 源码第 N 处出现，
 *   与 buildUnits 的 occurrence 一致——重复句各自高亮，不受懒渲染/包装时机影响
 *   （音频缓存键仍只按文本算，与高亮位置无关）
 */
export class NoteHighlighter {
  private lastId: string | null = null;

/** 高亮当前句；follow=true（跟读模式）时同时滚动到可视区。
 *  occurrence = 同 id 句子在文档中的第几个出现（0 起，源码顺序）。
 *  ctx = 该句前后单元的文本（可选）：提供时优先选前后块文本与之相符的 span，
 *  重复文本在 DOM span 不完整时也不会高亮错位。
 *  explicit = 用户刚点击的那个 span（可选）：命中时直接用它，不再反推——
 *  嵌套列表等结构里上下文反推可能失准，点击处必须精确高亮。 */
setActive(
  id: string | null,
  follow = true,
  occurrence = 0,
  ctx?: HighlightContext,
  explicit?: HTMLElement | null,
): void {
  this.lastId = id;
  document.querySelectorAll('.va-sent.va-active').forEach((el) => el.removeClass('va-active'));
  if (!id) return;
  // 用户点击的那一处优先：仍连接在文档中且 id 一致就直接高亮
  if (explicit && explicit.isConnected && explicit.dataset.va === id) {
    explicit.addClass('va-active');
    if (follow) explicit.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  // 每个阅读视图容器内取「文档序第 occurrence 个同 id span」：
  // 文档序 = 源码行序，与 buildUnits 的 occurrence 天然对齐；多窗格各自命中正确的那一处
  const find = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    for (const container of Array.from(document.querySelectorAll('.markdown-preview-view'))) {
      const els = Array.from(
        container.querySelectorAll<HTMLElement>(`.va-sent[data-va="${id}"]`),
      );
      const hit = ctx ? pickSpanByContext(els, ctx) : undefined;
      if (hit) out.push(hit);
      else if (els[occurrence]) out.push(els[occurrence]);
    }
    // 存底：容器外的 span（如 live preview）按文档序取第 occurrence 个
    if (!out.length) {
      const els = Array.from(document.querySelectorAll<HTMLElement>(`.va-sent[data-va="${id}"]`));
      const hit = ctx ? pickSpanByContext(els, ctx) : undefined;
      if (hit) out.push(hit);
      else if (els[occurrence]) out.push(els[occurrence]);
    }
    return out;
  };
  const found = find();
  if (found.length) {
    found.forEach((el) => el.addClass('va-active'));
    if (follow) found[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  // 阅读视图懒渲染：目标句所在区块可能尚未渲染，滚动触发渲染后重试
  let tries = 0;
  const retry = () => {
    if (this.lastId !== id || ++tries > 6) return;
    const again = find();
    if (again.length) {
      again.forEach((el) => el.addClass('va-active'));
      if (follow) again[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      window.setTimeout(retry, 350);
    }
  };
  window.setTimeout(retry, 350);
}
}

/**
 * 取 span 所在内容块的前后各三个兄弟块文本（重复句的上下文定位用，由近到远）。
 * 块 = 最近的 p/h/li/td/th/pre 祖先；块文本可能跨多个单元，由匹配侧做结尾/包含比对。
 * 注意：Obsidian 阅读视图会把块包进 section 容器（块在容器内可能没有兄弟），
 * 此时向上跳到容器层继续找兄弟，否则会拿到空上下文。
 */
export function neighborTexts(el: HTMLElement): { prevBlocks: string[]; nextBlocks: string[] } {
  const block = el.closest('p, h1, h2, h3, h4, h5, h6, li, td, th, pre');
  if (!block) return { prevBlocks: [], nextBlocks: [] };
  return {
    prevBlocks: collectSiblingTexts(block, 'prev'),
    nextBlocks: collectSiblingTexts(block, 'next'),
  };
}

/** 收集前/后各最多 3 个兄弟块的文本；无兄弟时向上跳一层容器继续（最多 6 跳，到阅读视图根为止）。 */
function collectSiblingTexts(start: Element, dir: 'prev' | 'next'): string[] {
  const out: string[] = [];
  let cur: Element | null = start;
  let hops = 0;
  while (cur && out.length < 3 && hops < 6) {
    hops++;
    const sib: Element | null =
      dir === 'prev' ? cur.previousElementSibling : cur.nextElementSibling;
    if (!sib) {
      const parent: HTMLElement | null = cur.parentElement;
      // 到阅读视图根为止：再往上跳就跨出本笔记了
      if (
        !parent ||
        parent.classList.contains('markdown-preview-view') ||
        parent.classList.contains('markdown-preview-sizer')
      ) {
        break;
      }
      cur = parent;
      continue;
    }
    out.push(sib.textContent ?? '');
    cur = sib;
  }
  return out;
}

/** 高亮上下文：当前句前后各若干个单元的文本（由近到远，播放侧从单元序列取出）。 */
export interface HighlightContext {
  prev?: string[];
  next?: string[];
}

/** 在一组同 id 的 span 中，选前后块文本与单元上下文最相符的那个。
 *  取最高分（≥6 才信任，否则返回 undefined 由调用方按 occurrence 兜底）——
 *  不能按文档序提前返回：靠前的 span 可能只是共享 boilerplate 的弱匹配。 */
function pickSpanByContext(
  els: HTMLElement[],
  ctx: HighlightContext,
): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  let bestScore = 0;
  for (const el of els) {
    const nt = neighborTexts(el);
    const score = blockMatchScore(
      nt.prevBlocks,
      nt.nextBlocks,
      ctx.prev ?? [],
      ctx.next ?? [],
    );
    if (score > bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return bestScore >= 6 ? best : undefined;
}

export function registerAnnotationPostProcessor(
  plugin: Plugin,
  getIndex: () => UnitIndex | null,
  isReadCodeActive: () => boolean = () => false,
  isReadTablesActive: () => boolean = () => false,
): void {
  plugin.registerMarkdownPostProcessor((el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
    // Obsidian 逐块调用后处理器：el 本身常常就是 <p>/<h2>/<li>…，必须把它自己也算进候选；
    // callout 标题不是标题标签，靠类名补充候选；td/th 仅在阅读表格开启时参与（否则重复句计数会错位）
    const includeTables = isReadTablesActive();
    const targets: HTMLElement[] = [];
    if (
      /^(P|H[1-6]|LI)$/.test(el.tagName) ||
      (includeTables && /^(TD|TH)$/.test(el.tagName)) ||
      el.hasClass('callout-title-inner')
    ) {
      targets.push(el);
    }
    const selector = includeTables
      ? 'p, h1, h2, h3, h4, h5, h6, li, td, th, .callout-title-inner'
      : 'p, h1, h2, h3, h4, h5, h6, li, .callout-title-inner';
    for (const node of Array.from(el.querySelectorAll(selector))) {
      targets.push(node as HTMLElement);
    }
    for (const t of targets) {
      try {
        wrapParagraph(t, getIndex, isReadCodeActive());
      } catch (e) {
        console.warn('[voice-aloud] wrap failed', e);
      }
    }
    // 代码块按行包装（阅读代码开启时）；pre 自身也可能是 el
    if (isReadCodeActive()) {
      const pres: HTMLElement[] = [];
      if (el.tagName === 'PRE') pres.push(el);
      for (const node of Array.from(el.querySelectorAll('pre'))) pres.push(node as HTMLElement);
      for (const p of pres) {
        try {
          wrapCodeBlock(p, getIndex);
        } catch (e) {
          console.warn('[voice-aloud] wrap code failed', e);
        }
      }
    }
  });
}

/** 主动扫描所有打开的阅读视图做句子包装（不依赖后处理器语义），返回本次包装数量。 */
export function wrapAllReadingViews(
  getIndex: () => UnitIndex | null,
  isReadCodeActive: () => boolean = () => false,
  isReadTablesActive: () => boolean = () => false,
): number {
  let count = 0;
  const includeTables = isReadTablesActive();
  const selector = includeTables
    ? 'p, h1, h2, h3, h4, h5, h6, li, td, th, .callout-title-inner'
    : 'p, h1, h2, h3, h4, h5, h6, li, .callout-title-inner';
  for (const container of Array.from(document.querySelectorAll('.markdown-preview-view'))) {
    for (const node of Array.from(container.querySelectorAll(selector))) {
      const t = node as HTMLElement;
      if (t.hasClass('va-done')) continue;
      try {
        const before = t.querySelectorAll('.va-sent').length;
        wrapParagraph(t, getIndex, isReadCodeActive());
        if (t.querySelectorAll('.va-sent').length > before || t.hasClass('va-done')) count++;
      } catch (e) {
        console.warn('[voice-aloud] wrap failed', e);
      }
    }
    if (isReadCodeActive()) {
      for (const node of Array.from(container.querySelectorAll('pre'))) {
        const p = node as HTMLElement;
        if (p.hasClass('va-done')) continue;
        try {
          wrapCodeBlock(p, getIndex);
          count++;
        } catch (e) {
          console.warn('[voice-aloud] wrap code failed', e);
        }
      }
    }
  }
  return count;
}

/**
 * li 的这些直接子元素不参与断句，原位保留：
 * 嵌套列表、宽松列表的 <p>（会作为独立目标处理）、任务列表 checkbox、Obsidian 内部结构（如 list-bullet）。
 */
const LI_SKIP_TAGS = new Set([
  'UL',
  'OL',
  'P',
  'DIV',
  'BLOCKQUOTE',
  'TABLE',
  'PRE',
  'DL',
  'HR',
  'FIGURE',
  'INPUT',
]);

function wrapParagraph(
  p: HTMLElement,
  getIndex: () => UnitIndex | null,
  keepInlineCode = false,
): void {
  if (p.hasClass('va-done')) return;
  const index = getIndex();
  if (!index) return;
  const isListItem = p.tagName === 'LI';
  // 阅读代码关闭时不朗读行内代码（如词表单词后的注音）：整段剔除其文本，与解析侧一致
  const skipCode = !keepInlineCode;
  const childNodes = Array.from(p.childNodes);
  const joinSentence = (n: Node): boolean => {
    if (skipCode && n.nodeType === 1 && (n as HTMLElement).tagName === 'CODE') return false;
    return !isListItem || n.nodeType !== 1 || !LI_SKIP_TAGS.has((n as HTMLElement).tagName);
  };
  const text = childNodes
    .filter(joinSentence)
    .map((n) => n.textContent || '')
    .join('');
  if (!text.trim()) return;
  // 软换行（连续源码行渲染成同一段落）也当切分点：解析侧按行切句，
  // 这里用 splitLinesExact 让段级 span 与行级单元一一对齐
  const pieces = splitLinesExact(text);
  if (!pieces.length) return;
  const units: Array<ReadingUnit | undefined> = pieces.map((x) => index.findByText(x));
  // 只处理属于当前笔记句子集的段落（至少一句命中）
  if (!units.some(Boolean)) return;

  const frag = document.createDocumentFragment();
  let si = 0;
  let offset = 0; // 当前句已累积字符
  let span = document.createElement('span');
  span.className = 'va-sent';
  const id0 = units[0]?.id;
  if (id0) span.dataset.va = id0;

  const finishSentence = () => {
    frag.appendChild(span);
    si++;
    if (si < pieces.length) {
      span = document.createElement('span');
      span.className = 'va-sent';
      const nid = units[si]?.id;
      if (nid) span.dataset.va = nid;
    }
  };

  // 元素的有效文本长度（阅读代码关闭时行内代码不计入，与解析侧剔除一致）
  const effLen = (node: Node): number => {
    if (node.nodeType === 3) return (node.textContent || '').length;
    if (node.nodeType !== 1) return 0;
    const el = node as HTMLElement;
    if (skipCode && el.tagName === 'CODE') return 0;
    let n = 0;
    el.childNodes.forEach((c) => {
      n += effLen(c);
    });
    return n;
  };
  const walk = (node: Node): void => {
    if (skipCode && node.nodeType === 1 && (node as HTMLElement).tagName === 'CODE') {
      // 行内代码不朗读：保留在 DOM 里（视觉不变），但不计入句子文本/偏移
      span.appendChild(node);
      return;
    }
    if (si >= pieces.length) {
      span.appendChild(node);
      return;
    }
    if (node.nodeType === 3) {
      let t = node.textContent || '';
      while (t.length > 0 && si < pieces.length) {
        const need = pieces[si].length - offset;
        if (t.length <= need) {
          offset += t.length;
          span.appendChild(document.createTextNode(t));
          t = '';
        } else {
          span.appendChild(document.createTextNode(t.slice(0, need)));
          t = t.slice(need);
          offset = pieces[si].length;
        }
        if (offset >= pieces[si].length && pieces[si].length > 0) {
          finishSentence();
          offset = 0;
        }
      }
      if (t.length > 0) span.appendChild(document.createTextNode(t));
      return;
    }
    // 元素节点：整体落进当前句且不跨句界 → 原样保留（保住加粗/链接及原生事件）
    const elLen = effLen(node);
    if (offset + elLen <= pieces[si].length - 0.0001 || offset + elLen === pieces[si].length) {
      offset += elLen;
      span.appendChild(node);
      if (offset >= pieces[si].length && pieces[si].length > 0) {
        finishSentence();
        offset = 0;
      }
      return;
    }
    // 跨句界的内联元素：丢弃外壳标签，子节点继续按文本流分句（仅该处丢格式）
    for (const child of Array.from(node.childNodes)) walk(child);
  };

  for (const child of childNodes) {
    // 行内代码（如词表单词后的注音）：阅读代码关闭时不朗读，但必须留在原位置——
    // 放进当前句 span（不计入偏移），否则会跑到句子前面/后面，破坏原有显示顺序
    if (skipCode && child.nodeType === 1 && (child as HTMLElement).tagName === 'CODE') {
      span.appendChild(child);
      continue;
    }
    if (joinSentence(child)) walk(child);
    else frag.appendChild(child);
  }
  // 收尾：补最后未闭合的 span（无句界标点的段落尾）
  if (si < pieces.length || span.textContent !== null) {
    if (span.childNodes.length > 0 || si < pieces.length) frag.appendChild(span);
  }
  p.replaceChildren(frag);
  p.addClass('va-done');
}

/**
 * 代码块按行包装（阅读代码开启时）：
 * - 每个非空代码行包成 <span class="va-sent" data-va=id>，与 buildUnits(includeCodeBlocks) 的一行一单元对齐
 * - 行内词法高亮 token 原样保留：文本节点按 \n 切行；含 \n 的元素（跨行 token）递归下钻
 * - 围栏首尾的空行（前导/收尾 \n）不产生 span；查不到单元的行原样保留
 */
function wrapCodeBlock(pre: HTMLElement, getIndex: () => UnitIndex | null): void {
  if (pre.hasClass('va-done')) return;
  const index = getIndex();
  if (!index) return;
  const code = pre.querySelector('code') ?? pre;
  // 逐行收集节点
  const lines: Node[][] = [[]];
  const newline = () => lines.push([]);
  const collect = (parent: Node): void => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) {
        const t = node.textContent ?? '';
        if (!t.includes('\n')) {
          if (t) lines[lines.length - 1].push(node);
          continue;
        }
        const parts = t.split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) newline();
          if (parts[i]) lines[lines.length - 1].push(document.createTextNode(parts[i]));
        }
      } else if (node.nodeType === 1) {
        const el = node as HTMLElement;
        // 跨行元素（极少数多行 token）递归拆到各行；普通 token 整块入当前行
        if ((el.textContent ?? '').includes('\n')) collect(el);
        else lines[lines.length - 1].push(node);
      }
    }
  };
  collect(code);
  const frag = document.createDocumentFragment();
  for (const nodes of lines) {
    const text = nodes
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    const unit = text ? index.findByText(text) : undefined;
    if (unit) {
      const span = document.createElement('span');
      span.className = 'va-sent';
      span.dataset.va = unit.id;
      for (const n of nodes) span.appendChild(n);
      frag.appendChild(span);
    } else {
      for (const n of nodes) frag.appendChild(n);
    }
  }
  code.replaceChildren(frag);
  pre.addClass('va-done');
}
