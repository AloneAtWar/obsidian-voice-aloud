import { describe, expect, it } from 'vitest';
import { formatBytes } from '../src/util/format';

describe('formatBytes', () => {
  it('字节 / KB / MB 三档', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(12 * 1024)).toBe('12 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('负数与小数不产生怪值', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(0.4)).toBe('0 B');
  });
});
