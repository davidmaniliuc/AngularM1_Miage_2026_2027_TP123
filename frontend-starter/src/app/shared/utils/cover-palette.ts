/** Side of the thumbnail the cover is reduced to before counting colors. */
const SAMPLE = 32;

interface Bucket {
  weight: number;
  r: number;
  g: number;
  b: number;
  count: number;
}

/**
 * Up to two accent colors of a cover, as CSS hsl() strings, most present
 * first. Vivid pixels count more than grey ones, so a colorful detail wins
 * over a large neutral background, as in Apple Music. Lightness is kept
 * between 30 % and 50 % so the color stays readable on a light card.
 */
export function pickPalette(pixels: Uint8ClampedArray): string[] {
  const buckets = new Map<number, Bucket>();

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max ? (max - min) / max : 0;
    // 3 bits per channel: close shades fall into the same bucket.
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0, count: 0 };
    bucket.weight += 0.15 + saturation;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count++;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()]
    .sort((x, y) => y.weight - x.weight)
    .map((bucket) => ({
      weight: bucket.weight,
      rgb: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as const,
    }));
  if (!ranked.length) return [];

  const [first] = ranked;
  const second = ranked.find(
    (candidate) => candidate.weight >= first.weight * 0.15 && distance(candidate.rgb, first.rgb) > 80,
  );
  return [first, second].filter((color) => !!color).map((color) => toAccent(color.rgb));
}

/** Reads the palette of a loaded <img>; [] when the browser has no canvas. */
export function paletteOf(image: HTMLImageElement): string[] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
  return pickPalette(context.getImageData(0, 0, SAMPLE, SAMPLE).data);
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function toAccent([r, g, b]: readonly number[]): string {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  let hue = 0;
  let saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }

  const l = Math.min(0.5, Math.max(0.3, lightness));
  return `hsl(${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(l * 100)}%)`;
}
