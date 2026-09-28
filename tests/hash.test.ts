import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/util/hash';

describe('sha256Hex', () => {
  it('确定性：同输入同输出', async () => {
    expect(await sha256Hex('abc')).toBe(await sha256Hex('abc'));
  });

  it('已知向量', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('不同输入不同输出', async () => {
    expect(await sha256Hex('abc')).not.toBe(await sha256Hex('abd'));
  });
});
