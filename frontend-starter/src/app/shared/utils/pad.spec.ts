import { describe, expect, it } from 'vitest';
import { PAD_BUTTONS, PAD_IDLE, padMask } from './pad';

describe('padMask', () => {
  it('is idle with no key held', () => {
    expect(padMask(new Set())).toBe(0xffff);
    expect(padMask(new Set(['KeyQ']))).toBe(PAD_IDLE);
  });

  it('clears the bit of each held button', () => {
    expect(padMask(new Set(['KeyX']))).toBe(0xffff & ~(1 << 14));
    expect(padMask(new Set(['ArrowUp', 'Enter']))).toBe(0xffff & ~(1 << 4) & ~(1 << 3));
  });

  it('gives every button its own bit and key', () => {
    expect(new Set(PAD_BUTTONS.map((b) => b.bit)).size).toBe(PAD_BUTTONS.length);
    expect(new Set(PAD_BUTTONS.map((b) => b.code)).size).toBe(PAD_BUTTONS.length);
  });
});
