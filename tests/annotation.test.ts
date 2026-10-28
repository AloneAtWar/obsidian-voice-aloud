// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { effectiveText, wrapAllReadingViews } from '../src/core/annotation';
import { buildUnits, UnitIndex, type ReadingUnit } from '../src/core/sentences';

/**
 * 正文标注（阅读视图）的 DOM 回归测试。
 * Obsidian 给 Element 原型挂了 hasClass / addClass 等助手，jsdom 没有——这里补最小实现，
 * 其余（querySelector、replaceChildren、dataset）jsdom 原生支持。
 */
beforeAll(() => {
  Element.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };
  Element.prototype.addClass = function (...classes: string[]): void {
    this.classList.add(...classes);
  };
});

/** 把 HTML 放进一个阅读视图容器（wrapAllReadingViews 只扫这个选择器）。 */
function render(html: string): HTMLElement {
  document.body.innerHTML = `<div class="markdown-preview-view">${html}</div>`;
  return document.querySelector('.markdown-preview-view') as HTMLElement;
}

const spanTexts = (root: ParentNode): string[] =>
  Array.from(root.querySelectorAll<HTMLElement>('.va-sent')).map((s) => s.textContent ?? '');

describe('行内代码（阅读代码关闭）', () => {
  it('effectiveText 递归剔除嵌套行内代码（点读定位与标注共用同一口径）', () => {
    document.body.innerHTML =
      '<p id="t">Hello <strong><code>ABCDE</code></strong> world!</p>';
    const p = document.getElementById('t') as HTMLElement;
    expect(effectiveText(p, true)).toBe('Hello  world!');
    expect(effectiveText(p, false)).toBe('Hello ABCDE world!');
  });

  it('嵌套在 strong 里的行内代码不截断后续普通句子', async () => {
    // 复现：Hello **`ABCDE`** world! Next sentence!
    // 渲染为 <p>Hello <strong><code>ABCDE</code></strong> world! Next sentence!</p>
    const md = 'Hello **`ABCDE`** world! Next sentence!';
    const units = await buildUnits(md);
    // 解析侧整段剔除行内代码 → 两处空格
    expect(units.map((u) => u.text)).toEqual(['Hello  world!', 'Next sentence!']);

    const root = render(
      '<p>Hello <strong><code>ABCDE</code></strong> world! Next sentence!</p>',
    );
    wrapAllReadingViews(() => new UnitIndex(units), () => false);

    const spans = Array.from(root.querySelectorAll<HTMLElement>('p > .va-sent'));
    expect(spans).toHaveLength(2);
    // 代码元素原位保留（视觉不变），但不参与句子长度：第二句必须是完整的 Next sentence!
    expect(spans[0].textContent).toBe('Hello ABCDE world!');
    expect(spans[1].textContent).toBe(' Next sentence!');
    expect(spans[1].dataset.va).toBe(units[1].id);
  });

  it('直接子行内代码仍原位保留且不参与长度', async () => {
    const md = '先看单词 `example` 再读下一句。后一句。';
    const units = await buildUnits(md);
    const root = render('<p>先看单词 <code>example</code> 再读下一句。后一句。</p>');
    wrapAllReadingViews(() => new UnitIndex(units), () => false);
    const spans = Array.from(root.querySelectorAll<HTMLElement>('p > .va-sent'));
    expect(spans.map((s) => s.dataset.va)).toEqual(units.map((u) => u.id));
    // 代码仍在原来的位置（不跑到句首/句尾）
    expect(spans[0].textContent).toBe('先看单词 example 再读下一句。');
    expect(root.querySelector('code')?.textContent).toBe('example');
  });
});

describe('行内代码（阅读代码开启）', () => {
  it('嵌套行内代码参与切分，后续句子仍完整', async () => {
    const md = 'Hello **`ABCDE`** world! Next sentence!';
    const units = await buildUnits(md, { code: true });
    expect(units.map((u) => u.text)).toEqual(['Hello ABCDE world!', 'Next sentence!']);

    const root = render(
      '<p>Hello <strong><code>ABCDE</code></strong> world! Next sentence!</p>',
    );
    wrapAllReadingViews(() => new UnitIndex(units), () => true);
    const spans = Array.from(root.querySelectorAll<HTMLElement>('p > .va-sent'));
    expect(spans.map((s) => s.textContent)).toEqual(['Hello ABCDE world!', ' Next sentence!']);
  });
});

describe('代码块按行包装（阅读代码开启）', () => {
  const codeOf = (root: HTMLElement): HTMLElement => root.querySelector('code') as HTMLElement;

  it('保留行间换行、空行与末尾换行（含词法高亮 token）', async () => {
    const units = await buildUnits('```js\nconst a = 1;\n\nconsole.log(a);\n```', { code: true });
    expect(units.map((u) => u.text)).toEqual(['const a = 1;', 'console.log(a);']);

    const root = render(
      '<pre><code><span class="token keyword">const</span> a = 1;\n\n' +
        '<span class="token function">console</span>.log(a);\n</code></pre>',
    );
    const before = codeOf(root).textContent;
    expect(before).toBe('const a = 1;\n\nconsole.log(a);\n');

    wrapAllReadingViews(() => new UnitIndex(units), () => true);

    // 换行一个都不能少：少了会把代码挤成一整行（显示与复制都错）
    expect(codeOf(root).textContent).toBe(before);
    const spans = Array.from(codeOf(root).querySelectorAll<HTMLElement>('.va-sent'));
    expect(spans.map((s) => s.dataset.va)).toEqual([units[0].id, units[1].id]);
    // 行尾换行留在该行 span 内，行与行之间不会被合并
    expect(spans[0].textContent).toBe('const a = 1;\n');
    expect(spans[1].textContent).toBe('console.log(a);\n');
  });

  it('纯文本代码块（无词法 token）同样保留换行', async () => {
    const units = await buildUnits('```\nline one\nline two\n```', { code: true });
    const root = render('<pre><code>line one\nline two\n</code></pre>');
    wrapAllReadingViews(() => new UnitIndex(units), () => true);
    expect(codeOf(root).textContent).toBe('line one\nline two\n');
  });

  it('未匹配到朗读单元的行也保留换行', async () => {
    const units: ReadingUnit[] = [
      { id: 'u1', occurrence: 0, text: 'const a = 1;', kind: 'text', heading: null, level: 0 },
    ];
    const root = render('<pre><code>const a = 1;\n// 注释行\n</code></pre>');
    wrapAllReadingViews(() => new UnitIndex(units), () => true);
    expect(codeOf(root).textContent).toBe('const a = 1;\n// 注释行\n');
    expect(spanTexts(root)).toEqual(['const a = 1;\n']);
  });

  it('跨行 token 拆到各行后仍保留换行', async () => {
    const units = await buildUnits('```\nab\ncd\n```', { code: true });
    const root = render('<pre><code><span class="token">ab\ncd</span>\n</code></pre>');
    wrapAllReadingViews(() => new UnitIndex(units), () => true);
    expect(codeOf(root).textContent).toBe('ab\ncd\n');
  });
});
