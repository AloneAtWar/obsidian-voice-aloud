import { describe, expect, it } from 'vitest';
import {
  buildUnits,
  canonText,
  cleanInlineMarkdown,
  splitParagraphExact,
  stripFrontmatter,
  UnitIndex,
} from '../src/core/sentences';

describe('splitParagraphExact', () => {
  it('按中英文句界切分', () => {
    expect(splitParagraphExact('第一句。第二句！第三句？')).toEqual([
      '第一句。',
      '第二句！',
      '第三句？',
    ]);
  });

  it('分号也是句界', () => {
    expect(splitParagraphExact('其一；其二；其三；')).toEqual(['其一；', '其二；', '其三；']);
  });

  it('无句界标点的整段保留为一片', () => {
    expect(splitParagraphExact('没有标点的一段话')).toEqual(['没有标点的一段话']);
  });

  it('超长句子在逗号处二切，片段拼接等于原文', () => {
    const raw = '这是一个非常长的句子'.repeat(20);
    const pieces = splitParagraphExact(raw);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(raw);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(81);
  });

  it('空白片段被丢弃，片段保留原文（前导空格由下游 trim）', () => {
    expect(splitParagraphExact('。 之后是空白。')).toEqual(['。', ' 之后是空白。']);
  });
});

describe('cleanInlineMarkdown', () => {
  it('剥 wikilink（带别名用别名）', () => {
    expect(cleanInlineMarkdown('看[[目标]]和[[目标|别名]]')).toBe('看目标和别名');
  });

  it('剥 markdown 链接/加粗/斜体', () => {
    expect(cleanInlineMarkdown('[文字](http://x)**粗***斜*')).toBe('文字粗斜');
  });

  it('剥列表前缀', () => {
    expect(cleanInlineMarkdown('- 项目一')).toBe('项目一');
    expect(cleanInlineMarkdown('12. 项目十二')).toBe('项目十二');
  });
});

describe('canonText', () => {
  it('弯引号/省略号归一，直引号内容不变', () => {
    expect(canonText('“引号”和…')).toBe('"引号"和...');
    expect(canonText('普通')).toBe('普通');
  });
});

describe('stripFrontmatter', () => {
  it('去掉 frontmatter', () => {
    expect(stripFrontmatter('---\ntitle: x\n---\n正文')).toBe('正文');
  });
});

describe('buildUnits', () => {
  it('标题与正文都成为单元，跳过表格/代码/引用/嵌入', async () => {
    const md = [
      '---',
      'k: v',
      '---',
      '# 标题一',
      '',
      '第一句。第二句。',
      '',
      '| a | b |',
      '| - | - |',
      '',
      '> 引用行',
      '',
      '```',
      'code',
      '```',
      '',
      '![[_embed]]',
      '',
      '- 列表项一句。',
    ].join('\n');
    const units = await buildUnits(md);
    const texts = units.map((u) => u.text);
    expect(texts).toEqual(['标题一', '第一句。', '第二句。', '列表项一句。']);
    expect(units[0].kind).toBe('heading');
    expect(units[1].kind).toBe('text');
    expect(units[1].heading).toBe('标题一');
  });

  it('句子 id 稳定且随文本变化', async () => {
    const a = await buildUnits('同样一句。');
    const b = await buildUnits('同样一句。');
    const c = await buildUnits('改过一句。');
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).not.toBe(c[0].id);
  });

  it('排版差异（弯引号）不影响 id', async () => {
    const a = await buildUnits('他说“你好”。');
    const b = await buildUnits('他说"你好"。');
    expect(a[0].id).toBe(b[0].id);
  });
});

describe('UnitIndex', () => {
  it('按文本（含排版差异）查回单元', async () => {
    const units = await buildUnits('他说“你好”。再见！');
    const index = new UnitIndex(units);
    expect(index.findByText('他说"你好"。')?.id).toBe(units[0].id);
    expect(index.findByText('不存在')).toBeUndefined();
  });
});
