import { describe, expect, it } from 'vitest';
import { shouldExitPointRead } from '../src/core/point-read';

describe('shouldExitPointRead', () => {
  it('未激活时任何上下文都不触发退出', () => {
    expect(shouldExitPointRead(false, null)).toBe(false);
    expect(shouldExitPointRead(false, { leafExists: false, mode: 'other' })).toBe(false);
  });

  it('失去被追踪的 leaf（关闭笔记/换成非 markdown 视图）→ 退出', () => {
    expect(shouldExitPointRead(true, null)).toBe(true);
    expect(shouldExitPointRead(true, { leafExists: false, mode: 'preview' })).toBe(true);
  });

  it('切回编辑模式 → 退出', () => {
    expect(shouldExitPointRead(true, { leafExists: true, mode: 'source' })).toBe(true);
  });

  it('仍在阅读视图（含换了笔记）→ 保持', () => {
    expect(shouldExitPointRead(true, { leafExists: true, mode: 'preview' })).toBe(false);
  });

  it('leaf 存在但视图类型变了 → 退出', () => {
    expect(shouldExitPointRead(true, { leafExists: true, mode: 'other' })).toBe(true);
  });
});
