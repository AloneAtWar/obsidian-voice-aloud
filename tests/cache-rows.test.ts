import { describe, expect, it } from 'vitest';
import { sortCacheRows } from '../src/ui/cache-rows';
import type { NoteCacheInfo } from '../src/core/cache/storage';

const row = (
  accountId: string,
  voice: string,
  entries: number,
  bytes: number,
  accountName = accountId,
): NoteCacheInfo => ({
  notePath: 'note.md',
  owner: { accountId, accountName, voice },
  entries,
  bytes,
  updatedAt: 0,
});

const labels = (rows: NoteCacheInfo[]): string[] => rows.map((r) => r.owner.voice);

describe('sortCacheRows', () => {
  it('按音色显示名升序，与体积/条目数无关', () => {
    const rows = [
      row('a1', 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural', 2, 200_000),
      row('a1', 'en-US-AvaMultilingualNeural', 40, 900_000),
      row('a1', 'ja-JP-AoiNeural', 7, 50_000),
    ];
    const name: Record<string, string> = {
      'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural': 'zh~ 晓晓 最新神经语音',
      'en-US-AvaMultilingualNeural': 'en~ Ava Multilingual Neural',
      'ja-JP-AoiNeural': 'ja~ Aoi Neural',
    };
    const sorted = sortCacheRows(rows, (r) => name[r.owner.voice]);
    // en~ < ja~ < zh~：语言前缀天然分组，且不按体积（最大的一行排最前）
    expect(labels(sorted)).toEqual([
      'en-US-AvaMultilingualNeural',
      'ja-JP-AoiNeural',
      'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural',
    ]);
  });

  it('缓存增长（体积/条目变化）不改变顺序', () => {
    const before = [
      row('a1', 'v-b', 1, 10),
      row('a1', 'v-a', 3, 300),
      row('a1', 'v-c', 2, 20),
    ];
    const after = [
      row('a1', 'v-b', 9, 9999),
      row('a1', 'v-a', 3, 300),
      row('a1', 'v-c', 4, 4000),
    ];
    const label = (r: NoteCacheInfo): string => r.owner.voice.toUpperCase();
    expect(labels(sortCacheRows(before, label))).toEqual(['v-a', 'v-b', 'v-c']);
    expect(labels(sortCacheRows(after, label))).toEqual(['v-a', 'v-b', 'v-c']);
  });

  it('同名音色（多账号）按音色 ID → 账号名 → 账号 ID 兜底，顺序确定', () => {
    const rows = [
      row('acc-2', 'zh-CN-XiaoxiaoNeural', 1, 1, '工作号'),
      row('acc-1', 'zh-CN-XiaoxiaoNeural', 1, 1, '个人号'),
      row('acc-0', 'en-US-JennyNeural', 1, 1, '工作号'),
    ];
    const label = (): string => '同名校验';
    expect(sortCacheRows(rows, label).map((r) => r.owner.accountId)).toEqual([
      'acc-0', // 音色 ID 更小
      'acc-1', // 个人号 < 工作号（按名称排序，不是插入顺序）
      'acc-2',
    ]);
  });

  it('不修改传入数组', () => {
    const rows = [row('a1', 'v-b', 1, 1), row('a1', 'v-a', 1, 1)];
    const sorted = sortCacheRows(rows, (r) => r.owner.voice);
    expect(sorted).not.toBe(rows);
    expect(labels(rows)).toEqual(['v-b', 'v-a']);
  });
});
