/** Maps each PS1 pad bit (see shared/utils/pad.ts) to its Blender mesh name and press axis in glTF Y-up space. */
export interface ControllerButtonBinding {
  readonly bit: number;
  readonly meshName: string;
  /** Top face buttons & D-pad press down along -Y; shoulder triggers press inward along +Z. */
  readonly axis: 'y' | 'z';
  readonly delta: number;
}

export const PS1_BUTTON_BINDINGS: readonly ControllerButtonBinding[] = [
  { bit: 4, meshName: 'Btn_Up', axis: 'y', delta: -0.0022 },
  { bit: 6, meshName: 'Btn_Down', axis: 'y', delta: -0.0022 },
  { bit: 7, meshName: 'Btn_Left', axis: 'y', delta: -0.0022 },
  { bit: 5, meshName: 'Btn_Right', axis: 'y', delta: -0.0022 },
  { bit: 12, meshName: 'Btn_Triangle', axis: 'y', delta: -0.0024 },
  { bit: 13, meshName: 'Btn_Circle', axis: 'y', delta: -0.0024 },
  { bit: 14, meshName: 'Btn_Cross', axis: 'y', delta: -0.0024 },
  { bit: 15, meshName: 'Btn_Square', axis: 'y', delta: -0.0024 },
  { bit: 3, meshName: 'Btn_Start', axis: 'y', delta: -0.0018 },
  { bit: 0, meshName: 'Btn_Select', axis: 'y', delta: -0.0018 },
  { bit: 10, meshName: 'Btn_L1', axis: 'z', delta: 0.0028 },
  { bit: 8, meshName: 'Btn_L2', axis: 'z', delta: 0.0028 },
  { bit: 11, meshName: 'Btn_R1', axis: 'z', delta: 0.0028 },
  { bit: 9, meshName: 'Btn_R2', axis: 'z', delta: 0.0028 },
];

/** Fast 4x4 strided average RGB in [0, 1] from an RGBA emulator frame for dynamic CRT bounce lighting. */
export function sampleFrameColor(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  if (!width || !height || rgba.length < width * height * 4) return [0.16, 0.22, 0.32];
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const cols = 4;
  const rows = 4;
  for (let ry = 0; ry < rows; ry++) {
    const y = Math.floor(((ry + 0.5) / rows) * height);
    for (let rx = 0; rx < cols; rx++) {
      const x = Math.floor(((rx + 0.5) / cols) * width);
      const offset = (y * width + x) * 4;
      r += rgba[offset];
      g += rgba[offset + 1];
      b += rgba[offset + 2];
      count++;
    }
  }
  if (!count) return [0.16, 0.22, 0.32];
  return [r / (count * 255), g / (count * 255), b / (count * 255)];
}
