import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  displayLabel,
  formatVoiceLabel,
  labelFor,
  parseVoiceCatalog,
} from '../src/core/voice-catalog';

describe('parseVoiceCatalog', () => {
  it('推荐写法：voices 数组，顺序即下拉顺序', () => {
    const parsed = parseVoiceCatalog({
      version: 1,
      note: '说明文字不应被当成音色',
      voices: [
        { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓' },
        { id: 'en-US-JennyNeural', name: '珍妮' },
      ],
    });
    expect(parsed).toEqual([
      { id: 'zh-CN-XiaoxiaoNeural', label: 'zh~ 晓晓' },
      { id: 'en-US-JennyNeural', label: 'en~ 珍妮' },
    ]);
  });

  it('纯数组：对象项与字符串项都支持', () => {
    expect(parseVoiceCatalog([{ id: 'a-b-C', name: '甲' }, 'x-y-Z'])).toEqual([
      { id: 'a-b-C', label: '甲' },
      { id: 'x-y-Z', label: 'x-y-Z' },
    ]);
  });

  it('纯映射写法 { 音色ID: 名称 }', () => {
    expect(parseVoiceCatalog({ 'zh-CN-XiaoxiaoNeural': '晓晓', version: 1 })).toEqual([
      { id: 'zh-CN-XiaoxiaoNeural', label: 'zh~ 晓晓' },
    ]);
  });

  it('缺名称时把 id 自动格式化成可读名称', () => {
    expect(parseVoiceCatalog([{ id: 'zh-CN-XiaoyiNeural' }])).toEqual([
      { id: 'zh-CN-XiaoyiNeural', label: 'zh~ Xiaoyi Neural' },
    ]);
  });

  it('去重保留首次出现的名称与位置，跳过非法项', () => {
    const parsed = parseVoiceCatalog([
      { id: 'a-b-C', name: '甲' },
      { id: 'a-b-C', name: '甲2' },
      { id: '   ' },
      { name: '无 id' },
      null,
      42,
    ]);
    expect(parsed).toEqual([{ id: 'a-b-C', label: '甲' }]);
  });

  it('无法识别时返回 null（调用方回退）', () => {
    expect(parseVoiceCatalog(null)).toBeNull();
    expect(parseVoiceCatalog({})).toBeNull();
    expect(parseVoiceCatalog('nope')).toBeNull();
    expect(parseVoiceCatalog([])).toBeNull();
  });

  it('labelFor 命中取名称，未命中回退 id', () => {
    const catalog = parseVoiceCatalog([{ id: 'a-b-C', name: '甲' }]);
    expect(labelFor(catalog, 'a-b-C')).toBe('甲');
    expect(labelFor(catalog, 'x-y-Z')).toBe('x-y-Z');
    expect(labelFor(null, 'x-y-Z')).toBe('x-y-Z');
  });
});

describe('formatVoiceLabel', () => {
  it('英文多语种音色：拆出 Multilingual 与 Neural', () => {
    expect(formatVoiceLabel('en-US-AndrewMultilingualNeural')).toBe('Andrew Multilingual Neural');
  });

  it('HD 冒号形式：冒号变空格，Dragon/HD/Latest/Neural 逐词拆开', () => {
    expect(formatVoiceLabel('en-US-Ava:DragonHDLatestNeural')).toBe('Ava Dragon HD Latest Neural');
    expect(formatVoiceLabel('zh-CN-Xiaoxiao:DragonHDFlashLatestNeural')).toBe(
      'Xiaoxiao Dragon HD Flash Latest Neural',
    );
  });

  it('普通音色只补 Neural', () => {
    expect(formatVoiceLabel('en-US-AnaNeural')).toBe('Ana Neural');
    expect(formatVoiceLabel('ja-JP-AoiNeural')).toBe('Aoi Neural');
  });

  it('人名保持原样，不按大小写硬拆（SunHi / JiMin 不拆）', () => {
    expect(formatVoiceLabel('ko-KR-SunHiNeural')).toBe('SunHi Neural');
    expect(formatVoiceLabel('ko-KR-JiMinNeural')).toBe('JiMin Neural');
    expect(formatVoiceLabel('ko-KR-BongJinNeural')).toBe('BongJin Neural');
  });

  it('方言 locale 一起剥掉', () => {
    expect(formatVoiceLabel('zh-CN-sichuan-YunxiNeural')).toBe('Yunxi Neural');
    expect(formatVoiceLabel('zh-CN-liaoning-XiaobeiNeural')).toBe('Xiaobei Neural');
  });

  it('无法识别的写法原样返回', () => {
    expect(formatVoiceLabel('Serena')).toBe('Serena');
    expect(formatVoiceLabel('')).toBe('');
  });
});

describe('displayLabel：语言前缀', () => {
  it('中/英/日/韩各自加前缀', () => {
    expect(displayLabel('zh-CN-XiaoxiaoMultilingualNeural', '晓晓 多语言')).toBe('zh~ 晓晓 多语言');
    expect(displayLabel('en-US-AnaNeural')).toBe('en~ Ana Neural');
    expect(displayLabel('ja-JP-AoiNeural')).toBe('ja~ Aoi Neural');
    expect(displayLabel('ko-KR-JiMinNeural')).toBe('ko~ JiMin Neural');
  });

  it('方言 locale 只取语言子标签', () => {
    expect(displayLabel('zh-CN-sichuan-YunxiNeural', '云希 四川')).toBe('zh~ 云希 四川');
  });

  it('已带前缀的名称不重复加', () => {
    expect(displayLabel('en-US-AnaNeural', 'en~ Ana Neural')).toBe('en~ Ana Neural');
  });

  it('没有语言标签的写法（其他供应商的音色名）保持原样', () => {
    expect(displayLabel('Serena')).toBe('Serena');
    expect(displayLabel('chattts-a')).toBe('chattts-a');
  });
});

describe('随插件发布的 azure-voices.json', () => {
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../azure-voices.json', import.meta.url), 'utf8'),
  );
  const parsed = parseVoiceCatalog(raw);

  it('可解析且非空', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.length).toBeGreaterThan(0);
  });

  it('每个 id 形如 zh-CN-XxxNeural 或带 HD 冒号后缀', () => {
    for (const v of parsed!) {
      expect(v.id).toMatch(/^[a-z]{2,3}-[A-Za-z]{2,4}(-[A-Za-z]+)?-[A-Za-z0-9]+(:[A-Za-z0-9]+Neural|Neural)$/);
      expect(v.label.trim().length).toBeGreaterThan(0);
      expect(v.label).not.toBe(v.id);
    }
  });

  it('中文条目带 zh~ 前缀，英文条目带 en~ 前缀', () => {
    const first = parsed![0];
    expect(first.label.startsWith('zh~ ')).toBe(true);
    const andrew = parsed!.find((v) => v.id === 'en-US-AndrewMultilingualNeural');
    expect(andrew?.label).toBe('en~ Andrew Multilingual Neural');
    const aoi = parsed!.find((v) => v.id === 'ja-JP-AoiNeural');
    expect(aoi?.label).toBe('ja~ Aoi Neural');
  });

  it('id 不重复', () => {
    const ids = parsed!.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
