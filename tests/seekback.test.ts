import { describe, expect, it } from 'vitest';
import { computeSeekBack } from '../src/core/player';

const durations: Record<number, number> = { 0: 10, 1: 8, 2: 12, 3: 5 };
const durationOf = (i: number) => durations[i];

describe('computeSeekBack', () => {
  it('当前句内回退', () => {
    expect(computeSeekBack(2, 30, 15, durationOf)).toEqual({ idx: 2, offsetSec: 15 });
    expect(computeSeekBack(2, 15, 15, durationOf)).toEqual({ idx: 2, offsetSec: 0 });
  });

  it('跨句回退：剩余时长在前一句中扣回', () => {
    // 当前句 2 播到 3s，回退 15s → 前一句(1)共 8s 覆盖 3+8=11 < 15 → 再前一句(0)取 10-(15-11)=6
    expect(computeSeekBack(2, 3, 15, durationOf)).toEqual({ idx: 0, offsetSec: 6 });
    // 回退 10s → 前一句 8s 覆盖 3+8=11 > 10 → 句 1 的 8-(10-3)=1s 处
    expect(computeSeekBack(2, 3, 10, durationOf)).toEqual({ idx: 1, offsetSec: 1 });
  });

  it('回退量超过全部历史 → 笔记开头', () => {
    expect(computeSeekBack(3, 2, 999, durationOf)).toEqual({ idx: 0, offsetSec: 0 });
  });

  it('遇到未知时长的句子 → 从该句开头重播', () => {
    expect(computeSeekBack(5, 1, 20, () => undefined)).toEqual({ idx: 4, offsetSec: 0 });
  });

  it('无历史也回退到开头', () => {
    expect(computeSeekBack(1, 0, 15, () => undefined)).toEqual({ idx: 0, offsetSec: 0 });
  });
});
