import { describe, expect, it } from 'vitest';
import {
  blockMatchScore,
  buildUnits,
  canonText,
  cleanInlineMarkdown,
  isTableSeparator,
  locateUnit,
  neighborUnitTexts,
  splitParagraphExact,
  splitTableRow,
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

  it('重复文本：同 id 不同 occurrence（按文档顺序 0 起）', async () => {
    // 空行分隔 = 独立段落；连续行会被合并成同一段落（与渲染器一致）
    const md = ['朗读', '', '别的一句。', '', '朗读'].join('\n');
    const units = await buildUnits(md);
    expect(units.map((u) => u.text)).toEqual(['朗读', '别的一句。', '朗读']);
    expect(units[0].id).toBe(units[2].id);
    expect(units.map((u) => u.occurrence)).toEqual([0, 0, 1]);
  });

  it('按行切句：软换行的每行都是独立单元（与标注侧 splitLinesExact 对齐）', async () => {
    // 真实场景：引用内连续 > 行渲染成一个 <p>，解析按行切句，标注把 \n 也当切分点 → 两侧一致
    const md = [
      '> Dear Jack:',
      '> I would like to convey my thanks. Your generous help made it better.',
      '> Sincerely Yours,',
    ].join('\n');
    const texts = (await buildUnits(md)).map((u) => u.text);
    expect(texts).toEqual([
      'Dear Jack:',
      'I would like to convey my thanks.',
      'Your generous help made it better.',
      'Sincerely Yours,',
    ]);
  });

  it('词表：每行一个单词即一句；行内代码（注音）默认不朗读，阅读代码开启时保留', async () => {
    const md = [
      '## 词汇总表',
      '',
      'conversation `[ˌkɒnɪˈveɪʃn]`',
      'customer `[ˈkʌstəmə(r)]`',
      'abandon',
      'ability',
    ].join('\n');
    // 默认：阅读代码关闭 → 注音整段剔除
    const off = (await buildUnits(md)).map((u) => u.text);
    expect(off).toEqual(['词汇总表', 'conversation', 'customer', 'abandon', 'ability']);
    // 阅读代码开启 → 保留代码内容（仅去反引号）
    const on = (await buildUnits(md, { code: true })).map((u) => u.text);
    expect(on).toEqual([
      '词汇总表',
      'conversation [ˌkɒnɪˈveɪʃn]',
      'customer [ˈkʌstəmə(r)]',
      'abandon',
      'ability',
    ]);
  });

  it('列表项每项一句；续行自成一单元；主题分隔线不产生单元', async () => {
    const md = ['- 第一项。', '- 第二项', '  续行内容。', '', '---', '', '正文。'].join('\n');
    const texts = (await buildUnits(md)).map((u) => u.text);
    expect(texts).toEqual(['第一项。', '第二项', '续行内容。', '正文。']);
  });

  it('阅读代码开启：代码行按行成单元（原文不清洗）；关闭时跳过', async () => {
    const md = ['前文。', '```js', 'const a = 1;', '', '// 注释', '```', '后文。'].join('\n');
    const off = (await buildUnits(md)).map((u) => u.text);
    expect(off).toEqual(['前文。', '后文。']);
    const on = (await buildUnits(md, { code: true })).map((u) => u.text);
    expect(on).toEqual(['前文。', 'const a = 1;', '// 注释', '后文。']);
    // 代码行不按标点断句、不清洗 markdown
    const raw = await buildUnits('```\n**bold** a; b\n```', { code: true });
    expect(raw.map((u) => u.text)).toEqual(['**bold** a; b']);
  });

  it('阅读表格开启：逐格切句、跳过分隔行；关闭时跳过', async () => {
    const md = [
      '前文。',
      '',
      '| 考点 | 策略 |',
      '| --- | :---: |',
      '| 概念题 | 靠背 |',
      '| SQL | 手写练习；不出错 |',
      '',
      '后文。',
    ].join('\n');
    const off = (await buildUnits(md)).map((u) => u.text);
    expect(off).toEqual(['前文。', '后文。']);
    const on = (await buildUnits(md, { tables: true })).map((u) => u.text);
    expect(on).toEqual([
      '前文。',
      '考点',
      '策略',
      '概念题',
      '靠背',
      'SQL',
      '手写练习；',
      '不出错',
      '后文。',
    ]);
  });

  it('表格：转义竖线不分格；空单元格不产生单元', async () => {
    const md = ['| a \\| b |  | c |', '| - | - | - |'].join('\n');
    const units = await buildUnits(md, { tables: true });
    expect(units.map((u) => u.text)).toEqual(['a | b', 'c']);
  });

  it('代码与表格可同时开启，occurrence 跨内容统一计数', async () => {
    const md = ['朗读', '| 朗读 | x |', '| - | - |', '```', '朗读', '```'].join('\n');
    const units = await buildUnits(md, { code: true, tables: true });
    expect(units.map((u) => u.text)).toEqual(['朗读', '朗读', 'x', '朗读']);
    expect(units.map((u) => u.occurrence)).toEqual([0, 1, 0, 2]);
    expect(new Set(units.filter((u) => u.text === '朗读').map((u) => u.id)).size).toBe(1);
  });

  it('splitTableRow / isTableSeparator', () => {
    expect(splitTableRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitTableRow('a\\|b | c')).toEqual(['a|b', 'c']);
    expect(isTableSeparator(['---', ':--:', '-'])).toBe(true);
    expect(isTableSeparator(['---', 'x'])).toBe(false);
    expect(isTableSeparator([])).toBe(false);
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

describe('locateUnit 重复句上下文定位', () => {
  // 模拟真实笔记结构：多年份章节，(前块,后块) boilerplate 完全相同，
  // 只有更深的窗口（各年不同的 Directions 原文）才能区分
  const md = [
    '## 2015年',
    '',
    '### Part A',
    '',
    '**题目要求**',
    '',
    '> Directions: Suppose you are asked to write about city traffic in 2015.',
    '> Do not write the address.',
    '',
    '**网上优秀作文**（本轮未检索到高质量网上范文，仅提供参考作文）',
    '',
    '**参考作文**',
    '',
    '> Dear Sir or Madam, 2015 版正文。',
    '',
    '## 2019年',
    '',
    '### Part A',
    '',
    '**题目要求**',
    '',
    '> Directions: Suppose you are asked to write about city traffic in 2019.',
    '> Do not write your address.',
    '',
    '**网上优秀作文**（本轮未检索到高质量网上范文，仅提供参考作文）',
    '',
    '**参考作文**',
    '',
    '> Dear Sir or Madam, 2019 版正文。',
  ].join('\n');

  const ctxFor = async (which: 0 | 1) => {
    const units = await buildUnits(md);
    const dups = units.map((u, i) => ({ u, i })).filter((x) => x.u.text === '参考作文');
    expect(dups.length).toBe(2);
    const i = dups[which].i;
    return { units, i, dups };
  };

  it('上下文唯一时精确定位（含相同 (前,后) boilerplate 的平局）', async () => {
    const { units, i } = await ctxFor(1);
    // 2019 那处的 DOM 兄弟块（渲染后文本）
    const idx = locateUnit(
      units,
      {
        text: '参考作文',
        prevBlocks: [
          '网上优秀作文（本轮未检索到高质量网上范文，仅提供参考作文）',
          'Directions: Suppose you are asked to write about city traffic in 2019. Do not write your address.',
        ],
        nextBlocks: ['Dear Sir or Madam, 2019 版正文。'],
      },
      -1,
    );
    expect(idx).toBe(i);
  });

  it('hint 错误时上下文仍然自愈（旧 bug：occ 错导致跳到第一处）', async () => {
    const { units, i, dups } = await ctxFor(1);
    const idx = locateUnit(
      units,
      {
        text: '参考作文',
        prevBlocks: [
          '网上优秀作文（本轮未检索到高质量网上范文，仅提供参考作文）',
          'Directions: Suppose you are asked to write about city traffic in 2019. Do not write your address.',
        ],
        nextBlocks: ['Dear Sir or Madam, 2019 版正文。'],
      },
      dups[0].i, // 错误的 hint（指向 2015 那处）
    );
    expect(idx).toBe(i);
  });

  it('2015 那处同样能精确定位', async () => {
    const { units, i } = await ctxFor(0);
    const idx = locateUnit(
      units,
      {
        text: '参考作文',
        prevBlocks: [
          '网上优秀作文（本轮未检索到高质量网上范文，仅提供参考作文）',
          'Directions: Suppose you are asked to write about city traffic in 2015. Do not write the address.',
        ],
        nextBlocks: ['Dear Sir or Madam, 2015 版正文。'],
      },
      -1,
    );
    expect(idx).toBe(i);
  });

  it('无上下文时返回第一个候选；文本不匹配返回 -1', async () => {
    const { units, dups } = await ctxFor(0);
    expect(locateUnit(units, { text: '参考作文' })).toBe(dups[0].i);
    expect(locateUnit(units, { text: '不存在的句子' })).toBe(-1);
    expect(locateUnit(units, { text: '' })).toBe(-1);
  });

  it('定位处的下一句即该处正文（修复自动连跳的错误目标）', async () => {
    const { units, i } = await ctxFor(1);
    const idx = locateUnit(
      units,
      {
        text: '参考作文',
        prevBlocks: ['网上优秀作文（本轮未检索到高质量网上范文，仅提供参考作文）'],
        nextBlocks: ['Dear Sir or Madam, 2019 版正文。'],
      },
      -1,
    );
    expect(units[idx + 1].text).toBe('Dear Sir or Madam, 2019 版正文。');
    expect(idx).toBe(i);
  });
});

describe('blockMatchScore / neighborUnitTexts', () => {
  it('近邻强匹配 +3，更深窗口包含匹配 +1', () => {
    // 前块以期望前单元结尾；后块以期望后单元开头
    const prev = ['前块文本 以前一单元结尾', '更早的块 包含 独特句子甲'];
    const next = ['以后一单元开头 后块文本', '更晚的块 包含 独特句子乙'];
    const s = blockMatchScore(prev, next, ['以前一单元结尾', '独特句子甲'], ['以后一单元开头', '独特句子乙']);
    expect(s).toBe(3 + 3 + 1 + 1);
  });

  it('深浅匹配按强度计分（近邻结尾/开头 +3，远处包含 +1）', () => {
    // 只有近邻匹配：3 + 3
    expect(
      blockMatchScore(['甲 以前一结尾'], ['以后一开头 乙'], ['以前一结尾'], ['以后一开头']),
    ).toBe(6);
    // 近邻不匹配，但第 2 个期望单元（≥4 字）出现在块文本中（远处包含）→ +1
    expect(
      blockMatchScore(
        ['无关前缀 独特句子甲乙 无关后缀'],
        ['无关后缀'],
        ['近期望不匹配', '独特句子甲乙'],
      ),
    ).toBe(1);
    // 过短的期望文本不参与远处匹配（防误匹配）
    expect(blockMatchScore(['块含 短句'], ['无关'], ['不匹配', '短句'])).toBe(0);
  });

  it('块与期望完全不符时得 0', () => {
    expect(blockMatchScore(['甲'], ['乙'], ['丙'], ['丁'])).toBe(0);
  });

  it('neighborUnitTexts 取前后各若干个单元（由近到远）', async () => {
    const units = await buildUnits('第一句。第二句。第三句。');
    const nb = neighborUnitTexts(units, 1);
    expect(nb.prev).toEqual(['第一句。']);
    expect(nb.next).toEqual(['第三句。']);
  });
});
