/** Fixed display size: the PS1 always outputs 4:3 whatever its pixel resolution. */
export const DISPLAY_WIDTH = 640;
export const DISPLAY_HEIGHT = 480;

/** Minimal 2D context surface needed to blit an emulator frame. */
export interface FrameBlitContext {
  imageSmoothingEnabled: boolean;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

/**
 * Stretches the emulator canvas (any resolution) onto the fixed 4:3 display canvas.
 * Returns false when the source has no pixels yet.
 */
export function blitFrameToDisplay(
  ctx: FrameBlitContext,
  source: { readonly width: number; readonly height: number },
  width = DISPLAY_WIDTH,
  height = DISPLAY_HEIGHT,
): boolean {
  if (source.width <= 0 || source.height <= 0) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  return true;
}

/** Camera distance so a screen of the given size fills `fill` of the viewport height (and fits its width). */
export function distanceToFitScreen(
  screenHeight: number,
  screenWidth: number,
  fovDeg: number,
  aspect: number,
  fill = 0.85,
): number {
  const halfTan = Math.tan((fovDeg * Math.PI) / 360);
  const forHeight = screenHeight / fill / 2 / halfTan;
  const forWidth = screenWidth / 0.96 / 2 / (halfTan * Math.max(aspect, 0.01));
  return Math.max(forHeight, forWidth);
}

/** Small deterministic PRNG (mulberry32) returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash used to seed one PRNG per material name. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
