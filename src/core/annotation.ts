import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { splitParagraphExact, type ReadingUnit, type UnitIndex } from './sentences';

/**
 * 正文句子标注（阅读视图）：
 * - 段落按句包成 <span class="va-sent" data-va=id>（与 TTS 断句共用 splitParagraphExact）
 * - 尽量保留内联格式（加粗/斜体/链接）；跨句的内联元素外壳会被拆开（仅丢失该处格式）
 * - 点击朗读由 main.ts 的事件委托处理（点读模式开启时）
 * - 播放高亮由 NoteHighlighter.setActive 切换 .va-active
 */
export class NoteHighlighter {
  private lastId: string | null = null;

  /** 高亮当前句；follow=true（跟读模式）时同时滚动到可视区。 */
  setActive(id: string | null, follow = true): void {
    this.lastId = id;
    document.querySelectorAll('.va-sent.va-active').forEach((el) => el.removeClass('va-active'));
    if (!id) return;
    const els = document.querySelectorAll<HTMLElement>(`.va-sent[data-va="${id}"]`);
    if (els.length) {
      els.forEach((el) => el.addClass('va-active'));
      if (follow) els[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    // 阅读视图懒渲染：目标句所在区块可能尚未渲染，滚动触发渲染后重试
    let tries = 0;
    const retry = () => {
      if (this.lastId !== id || ++tries > 6) return;
      const again = document.querySelectorAll<HTMLElement>(`.va-sent[data-va="${id}"]`);
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

export function registerAnnotationPostProcessor(
  plugin: Plugin,
  getIndex: () => UnitIndex | null,
): void {
  plugin.registerMarkdownPostProcessor((el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
    // Obsidian 逐块调用后处理器：el 本身常常就是 <p>/<h2>…，必须把它自己也算进候选
    const targets: HTMLElement[] = [];
    if (/^(P|H[1-6])$/.test(el.tagName)) targets.push(el);
    for (const node of Array.from(el.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))) {
      targets.push(node as HTMLElement);
    }
    for (const t of targets) {
      try {
        wrapParagraph(t, getIndex);
      } catch (e) {
        console.warn('[voice-aloud] wrap failed', e);
      }
    }
  });
}

/** 主动扫描所有打开的阅读视图做句子包装（不依赖后处理器语义），返回本次包装数量。 */
export function wrapAllReadingViews(getIndex: () => UnitIndex | null): number {
  let count = 0;
  for (const container of Array.from(document.querySelectorAll('.markdown-preview-view'))) {
    for (const node of Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))) {
      const t = node as HTMLElement;
      if (t.hasClass('va-done')) continue;
      try {
        const before = t.querySelectorAll('.va-sent').length;
        wrapParagraph(t, getIndex);
        if (t.querySelectorAll('.va-sent').length > before || t.hasClass('va-done')) count++;
      } catch (e) {
        console.warn('[voice-aloud] wrap failed', e);
      }
    }
  }
  return count;
}

function wrapParagraph(p: HTMLElement, getIndex: () => UnitIndex | null): void {
  if (p.hasClass('va-done')) return;
  const index = getIndex();
  if (!index) return;
  const text = p.textContent || '';
  if (!text.trim()) return;
  const pieces = splitParagraphExact(text);
  if (!pieces.length) return;
  const units: Array<ReadingUnit | undefined> = pieces.map((x) => index.findByText(x));
  // 只处理属于当前笔记句子集的段落（至少一句命中）
  if (!units.some(Boolean)) return;

  const frag = document.createDocumentFragment();
  let si = 0;
  let offset = 0; // 当前句已累积字符
  let span = document.createElement('span');
  span.className = 'va-sent';
  const id = units[0]?.id;
  if (id) span.dataset.va = id;

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

  const walk = (node: Node): void => {
    if (si >= pieces.length) {
      span.appendChild(node.cloneNode(true));
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
    // 元素节点：整体落进当前句且不跨句界 → 原样保留（保住加粗/链接）
    const elLen = (node.textContent || '').length;
    if (offset + elLen <= pieces[si].length - 0.0001 || offset + elLen === pieces[si].length) {
      offset += elLen;
      span.appendChild(node.cloneNode(true));
      if (offset >= pieces[si].length && pieces[si].length > 0) {
        finishSentence();
        offset = 0;
      }
      return;
    }
    // 跨句界的内联元素：丢弃外壳标签，子节点继续按文本流分句（仅该处丢格式）
    for (const child of Array.from(node.childNodes)) walk(child);
  };

  for (const child of Array.from(p.childNodes)) walk(child);
  // 收尾：补最后未闭合的 span（无句界标点的段落尾）
  if (si < pieces.length || span.textContent !== null) {
    if (span.childNodes.length > 0 || si < pieces.length) frag.appendChild(span);
  }
  p.replaceChildren(frag);
  p.addClass('va-done');
}
