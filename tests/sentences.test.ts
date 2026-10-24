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

  it('英文长句按 . 优先断句，不再触发 80 字硬切（回归：from 曾被切成 fr/om）', () => {
    const raw =
      'I am writing to complain about the Casio electronic dictionary which I bought from your online store last week. ';
    const pieces = splitParagraphExact(raw);
    expect(pieces).toEqual([
      'I am writing to complain about the Casio electronic dictionary which I bought from your online store last week.',
    ]);
    expect(pieces.join('')).toBe(raw.trimEnd());
  });

  it('硬切避让撇号单词（don\'t 不被拆开）', () => {
    const raw = 'a'.repeat(75) + " don't " + 'b'.repeat(30);
    const pieces = splitParagraphExact(raw);
    expect(pieces.join('')).toBe(raw);
    expect(pieces.some((p) => p.includes("don't"))).toBe(true);
  });

  it('前侧空格过早时向后找单词边界', () => {
    const raw = 'Hi ' + 'a'.repeat(85) + ' tail';
    const pieces = splitParagraphExact(raw);
    expect(pieces.join('')).toBe(raw);
    expect(pieces[0]).toBe('Hi ' + 'a'.repeat(85) + ' ');
    expect(pieces[1]).toBe('tail');
  });

  it('超长无空格串（URL）保持硬切且不丢字', () => {
    const raw = 'x'.repeat(200);
    const pieces = splitParagraphExact(raw);
    expect(pieces.join('')).toBe(raw);
    expect(pieces.length).toBe(3);
  });

  it('CJK 长句仍在 80 字硬切（单词避让不影响中文）', () => {
    const raw = '这是一个非常长的句子'.repeat(20);
    const pieces = splitParagraphExact(raw);
    expect(pieces.join('')).toBe(raw);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(80);
  });

  it('空白片段被丢弃，片段保留原文（前导空格由下游 trim）', () => {
    expect(splitParagraphExact('。 之后是空白。')).toEqual(['。', ' 之后是空白。']);
  });
});

describe('splitParagraphExact 英文句点断句', () => {
  it('多个英文句子按 . ! ? 逐句切分', () => {
    expect(splitParagraphExact('First one. Second two! Third three? Fourth.')).toEqual([
      'First one.',
      ' Second two!',
      ' Third three?',
      ' Fourth.',
    ]);
  });

  it('中英混排：英文句子在 . 处断开，中文句界不受影响', () => {
    expect(splitParagraphExact('中文段落。English one. 中文二。')).toEqual([
      '中文段落。',
      'English one.',
      ' 中文二。',
    ]);
  });

  it('缩写/小数点/版本号/词内点不拆句', () => {
    const raw = 'Dr. Smith met Mr. Lee at 3.14 p.m. They left.';
    expect(splitParagraphExact(raw)).toEqual(['Dr. Smith met Mr. Lee at 3.14 p.m. They left.']);
  });

  it('域名/URL 中的点不拆句（词内点后非空白）', () => {
    expect(splitParagraphExact('See example.com and https://a.b/c now. Bye.')).toEqual([
      'See example.com and https://a.b/c now.',
      ' Bye.',
    ]);
  });

  it('右引号/右括号紧随句点一起归入前片', () => {
    expect(splitParagraphExact('He said "stop." Then he left.')).toEqual([
      'He said "stop."',
      ' Then he left.',
    ]);
    expect(splitParagraphExact('"Really!" she asked. "Why?"')).toEqual([
      '"Really!"',
      ' she asked.',
      ' "Why?"',
    ]);
  });

  it('省略号结尾算句界', () => {
    expect(splitParagraphExact('He paused... Then spoke.')).toEqual(['He paused...', ' Then spoke.']);
  });

  it('撇号单词（don\'t）后的句点正常拆句', () => {
    expect(splitParagraphExact("I don't know. She left.")).toEqual(["I don't know.", ' She left.']);
  });

  it('单字母缩写（J. / i.e. 后半）后的句点不拆句', () => {
    expect(splitParagraphExact('J. R. R. Tolkien wrote it. The end.')).toEqual([
      'J. R. R. Tolkien wrote it.',
      ' The end.',
    ]);
  });

  it('超长英文段落仍按 . 切分，无句界的余下部分才走 80 字兜底', () => {
    const s1 = 'a'.repeat(90);
    const pieces = splitParagraphExact(`${s1}. ${'b'.repeat(90)}`);
    expect(pieces).toEqual([`${s1}.`, ` ${'b'.repeat(79)}`, 'b'.repeat(11)]);
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

  it('任务列表项连勾选框语法一起剥（渲染后的 checkbox 不含文本）', () => {
    expect(cleanInlineMarkdown('- [ ] 待办一')).toBe('待办一');
    expect(cleanInlineMarkdown('- [x] 已完成')).toBe('已完成');
    expect(cleanInlineMarkdown('1. [ ] 有序待办')).toBe('有序待办');
    // 无列表前缀的普通段落保持原样，仍能与渲染文本对齐
    expect(cleanInlineMarkdown('[ ] 不是任务列表')).toBe('[ ] 不是任务列表');
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
  it('标题与正文都成为单元，跳过表格/代码/嵌入；引用剥前缀成为单元', async () => {
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
    expect(texts).toEqual(['标题一', '第一句。', '第二句。', '引用行', '列表项一句。']);
    expect(units[0].kind).toBe('heading');
    expect(units[1].kind).toBe('text');
    expect(units[1].heading).toBe('标题一');
  });

  it('引用：嵌套、callout 标记、引用内列表/标题', async () => {
    const md = [
      '> 普通引用句。',
      '>> 嵌套引用句。',
      '> [!warning]',
      '> [!tip] 自定义标题',
      '> - 引用内列表项。',
      '> ## 引用内标题',
      '> 正文跟随。',
      '> ![[quote_embed]]',
      '> | a | b |',
    ].join('\n');
    const texts = (await buildUnits(md)).map((u) => u.text);
    expect(texts).toEqual([
      '普通引用句。',
      '嵌套引用句。',
      '自定义标题',
      '引用内列表项。',
      '引用内标题',
      '正文跟随。',
    ]);
  });

  it('引用内的代码围栏整块跳过（围栏线带 > 前缀）', async () => {
    const md = ['> ```', '> code inside quote', '> ```', '> 围栏后的引用句。'].join('\n');
    const texts = (await buildUnits(md)).map((u) => u.text);
    expect(texts).toEqual(['围栏后的引用句。']);
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
