import { describe, expect, it } from 'vitest';
import {
  foreignLocale,
  nativeScript,
  scriptOf,
  segmentByScript,
  wrapLanguageSpans,
} from '../src/core/providers/language-spans';

/** 测试用转义：与 azure.ts 的 escapeXml 等价的最小实现。 */
const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** 片段拼接必须等于原文（任何清洗都会让句子与原文对不上）。 */
const joined = (text: string): string =>
  segmentByScript(text)
    .map((s) => s.text)
    .join('');

describe('scriptOf / nativeScript', () => {
  it('汉字、假名、谚文为 cjk；拉丁字母为 latin；数字与标点为中性', () => {
    expect(scriptOf('你')).toBe('cjk');
    expect(scriptOf('あ')).toBe('cjk');
    expect(scriptOf('한')).toBe('cjk');
    expect(scriptOf('a')).toBe('latin');
    expect(scriptOf('É')).toBe('latin');
    expect(scriptOf('5')).toBeNull();
    expect(scriptOf('，')).toBeNull();
    expect(scriptOf(' ')).toBeNull();
  });

  it('locale → 原生书写系统', () => {
    expect(nativeScript('zh-CN')).toBe('cjk');
    expect(nativeScript('ja-JP')).toBe('cjk');
    expect(nativeScript('ko-KR')).toBe('cjk');
    expect(nativeScript('en-US')).toBe('latin');
    expect(nativeScript('')).toBe('latin');
  });

  it('外文片段的目标语言域', () => {
    expect(foreignLocale('cjk')).toBe('zh-CN');
    expect(foreignLocale('latin')).toBe('en-US');
  });
});

describe('segmentByScript', () => {
  const samples = [
    '例句：Given the current divorce rate of nearly 50 percent, that amounts to millions of cases.',
    '第 50 名的考生请注意',
    'AI 与 NLP 的结合',
    'Pure English only.',
    '纯中文句子，没有任何英文。',
    '50',
    '',
  ];

  it('片段拼接严格等于原文', () => {
    for (const s of samples) expect(joined(s)).toBe(s);
  });

  it('纯中文 / 纯英文 → 单段', () => {
    expect(segmentByScript('纯中文句子，没有任何英文。')).toHaveLength(1);
    expect(segmentByScript('Pure English only.')).toHaveLength(1);
  });

  it('整段无文字（只有数字）→ script=null', () => {
    expect(segmentByScript('50')).toEqual([{ script: null, text: '50' }]);
  });

  it('中文标签与英文正文分成两段，英文段完整包含 50 percent', () => {
    const segs = segmentByScript('例句：Given the rate of nearly 50 percent, that amounts.');
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ script: 'cjk', text: '例句：' });
    expect(segs[1].script).toBe('latin');
    expect(segs[1].text).toBe('Given the rate of nearly 50 percent, that amounts.');
  });

  it('数字归属：后面接拉丁字母 → 归英文；后面接汉字 → 归中文', () => {
    const en = segmentByScript('例句：50 percent 的数据');
    expect(en.find((s) => s.text.includes('50'))?.script).toBe('latin');

    const zh = segmentByScript('第 50 名的考生');
    expect(zh).toHaveLength(1);
    expect(zh[0].script).toBe('cjk');
  });

  it('相邻同类段合并，不按词切碎', () => {
    const segs = segmentByScript('AI 与 NLP');
    // 中文的「与」把两段英文隔开：latin / cjk / latin
    expect(segs.map((s) => s.script)).toEqual(['latin', 'cjk', 'latin']);
  });
});

describe('wrapLanguageSpans', () => {
  it('与音色同语种时不产生任何标签', () => {
    expect(wrapLanguageSpans('今天的句子很简单。', 'zh-CN', esc)).toBe('今天的句子很简单。');
    expect(wrapLanguageSpans('A plain sentence.', 'en-US', esc)).toBe('A plain sentence.');
  });

  it('中文音色 + 中英混排：仅英文片段被 en-US 包裹', () => {
    expect(wrapLanguageSpans('例句：50 percent of cases.', 'zh-CN', esc)).toBe(
      '例句：<lang xml:lang="en-US">50 percent of cases.</lang>',
    );
  });

  it('中文音色 + 整句英文：整句包一个语言域（数字随之读英文）', () => {
    expect(wrapLanguageSpans('Nearly 50 percent.', 'zh-CN', esc)).toBe(
      '<lang xml:lang="en-US">Nearly 50 percent.</lang>',
    );
  });

  it('英文音色 + 中文片段：包 zh-CN，首尾空白留在域外', () => {
    expect(wrapLanguageSpans('Hello 世界 ', 'en-US', esc)).toBe(
      'Hello <lang xml:lang="zh-CN">世界</lang> ',
    );
  });

  it('标签内的文本仍被转义', () => {
    expect(wrapLanguageSpans('标题 A & B 结束', 'zh-CN', esc)).toBe(
      '标题 <lang xml:lang="en-US">A &amp; B</lang> 结束',
    );
  });

  it('空文本返回空串', () => {
    expect(wrapLanguageSpans('', 'zh-CN', esc)).toBe('');
  });
});
