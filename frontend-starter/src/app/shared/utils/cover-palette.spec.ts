import { describe, it, expect } from 'vitest';
import { pickPalette } from './cover-palette';

/** Builds RGBA pixels from [r, g, b, a?] repeated `count` times. */
function pixels(...groups: [number[], number][]): Uint8ClampedArray {
  const values: number[] = [];
  for (const [[r, g, b, a = 255], count] of groups) {
    for (let i = 0; i < count; i++) values.push(r, g, b, a);
  }
  return new Uint8ClampedArray(values);
}

describe('pickPalette', () => {
  it('returns the color of a single-color cover', () => {
    expect(pickPalette(pixels([[200, 30, 30], 100]))).toEqual(['hsl(0 74% 45%)']);
  });

  it('prefers a vivid color over a larger grey background', () => {
    const [first] = pickPalette(pixels([[128, 128, 128], 300], [[20, 60, 220], 100]));
    expect(first).toMatch(/^hsl\(22\d /);
  });

  it('returns a second, clearly different color when there is one', () => {
    const palette = pickPalette(pixels([[220, 40, 40], 200], [[30, 160, 60], 120]));
    expect(palette).toHaveLength(2);
    expect(palette[0]).toMatch(/^hsl\(0 /);
    expect(palette[1]).toMatch(/^hsl\(13\d /);
  });

  it('ignores a second color too close to the first one', () => {
    expect(pickPalette(pixels([[220, 40, 40], 200], [[200, 50, 50], 120]))).toHaveLength(1);
  });

  it('keeps a very light color readable (lightness at most 50 %)', () => {
    expect(pickPalette(pixels([[255, 250, 200], 100]))[0]).toMatch(/ 50%\)$/);
  });

  it('keeps a black cover visible (lightness at least 30 %)', () => {
    expect(pickPalette(pixels([[5, 5, 5], 100]))).toEqual(['hsl(0 0% 30%)']);
  });

  it('ignores transparent pixels', () => {
    expect(pickPalette(pixels([[255, 0, 0, 0], 100]))).toEqual([]);
  });
});
