import * as THREE from 'three';
import { hashString, mulberry32 } from './scene-helpers';

type Rng = () => number;
type Ctx2D = CanvasRenderingContext2D;

const PS_TRIANGLE = '#3eb489';
const PS_CIRCLE = '#e0463f';
const PS_CROSS = '#4a7bd6';
const PS_SQUARE = '#e27bb4';

const PLASTIC_MATERIALS = new Set([
  'TV_Shell',
  'TV_Bezel',
  'PS1_BodyGrey',
  'PS1_AccentGrey',
  'PS1_MemCard',
  'Case_Spine',
  'Case_Clear',
  'CRT_ShellCharcoal',
]);

interface TextureContext {
  readonly anisotropy: number;
  readonly rng: Rng;
  readonly track: <T extends THREE.Texture>(tex: T) => T;
  plasticNoise(): THREE.CanvasTexture;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function toTexture(
  tc: TextureContext,
  canvas: HTMLCanvasElement,
  opts: { srgb?: boolean; repeat?: [number, number]; wrap?: boolean } = {},
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  // glTF UVs have their origin top-left, matching canvas row 0
  tex.flipY = false;
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = tc.anisotropy;
  if (opts.wrap !== false) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  }
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  return tc.track(tex);
}

/** Converts a canvas to a grayscale data map with luminance remapped into [lo, hi]. */
function grayCanvas(src: HTMLCanvasElement, lo = 0, hi = 1): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const v = Math.round((lo + (hi - lo) * Math.min(1, luma * 1.6)) * 255);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function noiseCanvas(size: number, rng: Rng, base: number, amp: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, base + (rng() - 0.5) * 2 * amp));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Wavy horizontal grain lines clipped to a rectangle. */
function grainLines(
  ctx: Ctx2D,
  rng: Rng,
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  dark: string,
  light: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0; i < count; i++) {
    const ly = y + rng() * h;
    const amp = 0.4 + rng() * 2.2;
    const freq = 0.004 + rng() * 0.012;
    const phase = rng() * 6.28;
    ctx.strokeStyle = rng() > 0.35 ? dark : light;
    ctx.globalAlpha = 0.05 + rng() * 0.16;
    ctx.lineWidth = 0.6 + rng() * 1.6;
    ctx.beginPath();
    for (let px = x; px <= x + w; px += 12) {
      const py = ly + Math.sin(px * freq + phase) * amp;
      if (px === x) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- generators

/** Oak parquet: tile = 1.2 m (U, plank length) x 1.12 m (V, 8 planks of 0.14 m). */
function applyFloor(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const W = 1024;
  const rows = 8;
  const H = 1024;
  const rh = H / rows;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#3b2616';
  ctx.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    const x0 = Math.floor(tc.rng() * W);
    for (const ox of [x0 - W, x0]) {
      const l = 0.36 + tc.rng() * 0.06;
      const col = `hsl(${28 + tc.rng() * 6}, ${42 + tc.rng() * 10}%, ${l * 100 * 0.62}%)`;
      ctx.fillStyle = col;
      ctx.fillRect(ox, r * rh, W, rh);
      grainLines(ctx, tc.rng, ox, r * rh, W, rh, 46, '#1e1008', '#a8743c');
      // end joint
      ctx.fillStyle = 'rgba(12,6,2,0.85)';
      ctx.fillRect(ox, r * rh, 2, rh);
    }
    ctx.fillStyle = 'rgba(12,6,2,0.8)';
    ctx.fillRect(0, r * rh, W, 2);
  }
  const rep: [number, number] = [1 / 1.2, 1 / 1.12];
  mat.map = toTexture(tc, canvas, { srgb: true, repeat: rep });
  const gray = grayCanvas(canvas, 0.5, 0.9);
  mat.roughnessMap = toTexture(tc, gray, { repeat: rep });
  mat.bumpMap = toTexture(tc, grayCanvas(canvas, 0.2, 0.8), { repeat: rep });
  mat.bumpScale = 0.8;
  mat.color.set(0xffffff);
  mat.roughness = 1;
}

function applyWall(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#b4ada0';
  ctx.fillRect(0, 0, 512, 512);
  const n = noiseCanvas(512, tc.rng, 128, 22);
  ctx.globalAlpha = 0.22;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(n, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  mat.map = toTexture(tc, canvas, { srgb: true });
  const bump = noiseCanvas(512, tc.rng, 128, 40);
  mat.bumpMap = toTexture(tc, bump);
  mat.bumpScale = 0.35;
  mat.color.set(0xffffff);
  mat.roughness = 0.95;
}

function applyBaseboard(mat: THREE.MeshStandardMaterial): void {
  mat.roughness = Math.max(mat.roughness, 0.6);
}

/** Rug: UV 0..1 over the whole rug; deep indigo field, muted 4-colour border motif. */
function applyRug(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const S = 1024;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#1f2233';
  ctx.fillRect(0, 0, S, S);
  const b = 70;
  // border band
  ctx.fillStyle = '#2b1f27';
  ctx.fillRect(28, 28, S - 56, S - 56);
  ctx.fillStyle = '#1b1e2e';
  ctx.fillRect(28 + b, 28 + b, S - 56 - 2 * b, S - 56 - 2 * b);
  // thin cream rules
  ctx.strokeStyle = 'rgba(205,190,160,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28 + 8, 28 + 8, S - 72, S - 72);
  ctx.strokeRect(28 + b - 8, 28 + b - 8, S - 56 - 2 * b + 16, S - 56 - 2 * b + 16);
  // border motif: small marks cycling through the four symbol colours, muted
  const colours = [PS_TRIANGLE, PS_CIRCLE, PS_CROSS, PS_SQUARE];
  const step = 52;
  const inner = 28 + b / 2;
  ctx.globalAlpha = 0.5;
  let k = 0;
  const mark = (cx: number, cy: number, i: number): void => {
    ctx.fillStyle = ctx.strokeStyle = colours[i % 4];
    ctx.lineWidth = 4;
    const s = 11;
    ctx.beginPath();
    switch (i % 4) {
      case 0:
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.8);
        ctx.lineTo(cx - s, cy + s * 0.8);
        ctx.closePath();
        ctx.stroke();
        break;
      case 1:
        ctx.arc(cx, cy, s, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 2:
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
        break;
      default:
        ctx.strokeRect(cx - s, cy - s, 2 * s, 2 * s);
    }
  };
  for (let p = 28 + b; p <= S - 28 - b; p += step, k++) {
    mark(p, inner, k);
    mark(p, S - inner, k + 2);
    mark(inner, p, k + 1);
    mark(S - inner, p, k + 3);
  }
  ctx.globalAlpha = 1;
  // central diamond lattice, very quiet
  ctx.strokeStyle = 'rgba(205,190,160,0.12)';
  ctx.lineWidth = 2;
  const c = S / 2;
  for (let r = 80; r < 380; r += 60) {
    ctx.beginPath();
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r, c);
    ctx.lineTo(c, c + r);
    ctx.lineTo(c - r, c);
    ctx.closePath();
    ctx.stroke();
  }
  // woven fibre shading
  const weave = makeCanvas(S, S);
  const img = weave[1].createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const cell = ((x >> 2) + (y >> 2)) & 1 ? 150 : 100;
      const v = cell + (tc.rng() - 0.5) * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  weave[1].putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(weave[0], 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  mat.map = toTexture(tc, canvas, { srgb: true, wrap: false });
  mat.bumpMap = toTexture(tc, weave[0], { wrap: false });
  mat.bumpScale = 0.9;
  mat.roughnessMap = toTexture(tc, grayCanvas(weave[0], 0.8, 1), { wrap: false });
  mat.color.set(0xffffff);
  mat.roughness = 1;
}

/** Walnut: 1 m tile, grain along U. */
function applyWalnut(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const S = 1024;
  const [canvas, ctx] = makeCanvas(S, S);
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  for (let i = 0; i <= 8; i++) {
    grad.addColorStop(i / 8, `hsl(${22 + tc.rng() * 6}, ${35 + tc.rng() * 10}%, ${14 + tc.rng() * 7}%)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  grainLines(ctx, tc.rng, 0, 0, S, S, 520, '#0c0502', '#7a4a28');
  // a few darker pores
  ctx.fillStyle = 'rgba(8,3,1,0.5)';
  for (let i = 0; i < 260; i++) ctx.fillRect(tc.rng() * S, tc.rng() * S, 6 + tc.rng() * 22, 1);
  mat.map = toTexture(tc, canvas, { srgb: true });
  mat.bumpMap = toTexture(tc, grayCanvas(canvas, 0.25, 0.75));
  mat.bumpScale = 0.5;
  mat.roughnessMap = toTexture(tc, grayCanvas(canvas, 0.45, 0.8));
  mat.color.set(0xffffff);
  mat.roughness = 1;
}

/** Speaker grille: panel about 0.2 x 0.06 m (10:3) so each cell is ~4 mm square. */
function applyGrille(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const cols = 50;
  const rows = 15;
  const W = 1024;
  const H = Math.round((W * rows) / cols);
  const [canvas, ctx] = makeCanvas(W, H);
  const cw = W / cols;
  const ch = H / rows;
  ctx.fillStyle = '#1a1a1d';
  ctx.fillRect(0, 0, W, H);
  const [bump, bctx] = makeCanvas(W, H);
  bctx.fillStyle = '#c8c8c8';
  bctx.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5 + (r % 2 ? 0.5 : 0)) * cw;
      const cy = (r + 0.5) * ch;
      const rad = Math.min(cw, ch) * 0.3;
      ctx.fillStyle = '#030304';
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      bctx.fillStyle = '#000';
      bctx.beginPath();
      bctx.arc(cx, cy, rad, 0, Math.PI * 2);
      bctx.fill();
    }
  }
  mat.map = toTexture(tc, canvas, { srgb: true, wrap: false });
  mat.bumpMap = toTexture(tc, bump, { wrap: false });
  mat.bumpScale = 1.2;
  mat.color.set(0xffffff);
  mat.roughness = 0.55;
}

function drawPosterSunset(ctx: Ctx2D, w: number, h: number): void {
  const horizon = h * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#14102a');
  sky.addColorStop(0.6, '#4c2f55');
  sky.addColorStop(1, '#b0645a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  // sun with slits
  const cx = w / 2;
  const cy = horizon - 30;
  const sun = ctx.createLinearGradient(0, cy - 120, 0, cy + 120);
  sun.addColorStop(0, '#e8b86a');
  sun.addColorStop(1, '#d1605a');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, horizon);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4c2f55';
  for (let i = 0; i < 6; i++) ctx.fillRect(cx - 130, cy + 8 + i * 17, 260, 2 + i * 1.6);
  ctx.restore();
  // ground and perspective grid
  ctx.fillStyle = '#120d1c';
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.strokeStyle = 'rgba(226,123,180,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, horizon);
    ctx.lineTo(cx + i * 70, h);
    ctx.stroke();
  }
  for (let i = 1; i <= 9; i++) {
    const y = horizon + (h - horizon) * Math.pow(i / 9, 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // racing stripes
  ctx.fillStyle = '#e0463f';
  ctx.globalAlpha = 0.75;
  ctx.fillRect(34, 0, 10, h * 0.22);
  ctx.fillStyle = '#4a7bd6';
  ctx.fillRect(52, 0, 10, h * 0.22);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e9dcc4';
  ctx.font = '700 44px ui-monospace, Menlo, monospace';
  ctx.fillText('RALLYE 97', 34, h * 0.3);
  ctx.fillStyle = '#c9b99c';
  ctx.font = '500 14px ui-monospace, Menlo, monospace';
  ctx.fillText('COURSE DE NUIT  /  2 JOUEURS', 36, h * 0.3 + 26);
}

function applyPoster(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const [canvas, ctx] = makeCanvas(512, 716);
  drawPosterSunset(ctx, 512, 716);
  mat.map = toTexture(tc, canvas, { srgb: true, wrap: false });
  mat.color.set(0xffffff);
  mat.roughness = 0.6;
}

function applyWindowNight(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S, S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#060b1c');
  g.addColorStop(0.6, '#0e1a38');
  g.addColorStop(1, '#1a2748');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(220,230,255,${0.2 + tc.rng() * 0.5})`;
    const r = tc.rng() > 0.85 ? 1.6 : 0.9;
    ctx.fillRect(tc.rng() * S, tc.rng() * S * 0.6, r, r);
  }
  // skyline silhouette with sparse lit windows
  ctx.fillStyle = '#05070f';
  let x = 0;
  const buildings: Array<[number, number, number]> = [];
  while (x < S) {
    const bw = 28 + tc.rng() * 50;
    const bh = 50 + tc.rng() * 110;
    buildings.push([x, bh, bw]);
    ctx.fillRect(x, S - bh, bw - 2, bh);
    x += bw;
  }
  for (const [bx, bh, bw] of buildings) {
    for (let wy = S - bh + 8; wy < S - 8; wy += 12) {
      for (let wx = bx + 5; wx < bx + bw - 9; wx += 10) {
        if (tc.rng() > 0.86) {
          ctx.fillStyle = tc.rng() > 0.5 ? 'rgba(240,190,110,0.8)' : 'rgba(200,215,255,0.6)';
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
  }
  const tex = toTexture(tc, canvas, { srgb: true, wrap: false });
  mat.map = tex;
  mat.emissiveMap = tex;
  mat.emissive.set(0xffffff);
  mat.emissiveIntensity = 0.7;
  mat.color.set(0x222a40);
  mat.roughness = 1;
  mat.metalness = 0;
}

function applyPlastic(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  mat.bumpMap = tc.plasticNoise();
  mat.bumpScale = 0.25;
}

const FABRIC_MATERIALS = new Set(['Curtain_Fabric', 'Rug_Fringe']);

/** Woven fabric: keeps the Blender colour, adds a fine weave bump + roughness (box UVs in metres). */
function applyFabric(mat: THREE.MeshStandardMaterial, tc: TextureContext): void {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.drawImage(noiseCanvas(S, tc.rng, 128, 34), 0, 0);
  const cell = 4;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const warp = ((x + y) / cell) % 2 === 0;
      ctx.fillStyle = warp ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  // One tile covers 0.12 m
  const rep: [number, number] = [1 / 0.12, 1 / 0.12];
  mat.bumpMap = toTexture(tc, canvas, { repeat: rep });
  mat.bumpScale = 0.6;
  mat.roughnessMap = toTexture(tc, grayCanvas(canvas, 0.75, 1), { repeat: rep });
  mat.roughness = 1;
}

function applyLampShade(mat: THREE.MeshStandardMaterial): void {
  if (mat.emissive.getHex() === 0) mat.emissive.set(0xffb468);
  mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.1);
}

// -------------------------------------------------------------------- entry

function hasUv(mesh: THREE.Mesh): boolean {
  return !!mesh.geometry?.getAttribute('uv');
}

/**
 * Applies canvas-generated textures to the loaded scene by glTF material name.
 * Returns every created texture so the caller can dispose them.
 */
export function applyProceduralTextures(root: THREE.Object3D, anisotropy: number): THREE.Texture[] {
  const created: THREE.Texture[] = [];
  const track = <T extends THREE.Texture>(tex: T): T => {
    created.push(tex);
    return tex;
  };
  let sharedNoise: THREE.CanvasTexture | undefined;
  const makeContext = (name: string): TextureContext => {
    const tc: TextureContext = {
      anisotropy,
      rng: mulberry32(hashString(name)),
      track,
      plasticNoise: () => {
        if (!sharedNoise) {
          const noise = noiseCanvas(128, mulberry32(0x5eed), 128, 60);
          sharedNoise = new THREE.CanvasTexture(noise);
          sharedNoise.flipY = false;
          sharedNoise.wrapS = sharedNoise.wrapT = THREE.RepeatWrapping;
          sharedNoise.repeat.set(6, 6);
          sharedNoise.anisotropy = anisotropy;
          track(sharedNoise);
        }
        return sharedNoise;
      },
    };
    return tc;
  };

  const done = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial) || done.has(mat)) continue;
      const name = mat.name;
      const tc = makeContext(name);
      const uv = hasUv(obj);
      done.add(mat);
      switch (name) {
        case 'Lamp_Shade':
          applyLampShade(mat);
          break;
        case 'Baseboard_Paint':
          applyBaseboard(mat);
          break;
        case 'Floor_Oak':
          if (uv) applyFloor(mat, tc);
          break;
        case 'Wall_Paint':
          if (uv) applyWall(mat, tc);
          break;
        case 'Rug_Fabric':
          if (uv) applyRug(mat, tc);
          break;
        case 'Wood_Walnut':
          if (uv) applyWalnut(mat, tc);
          break;
        case 'TV_Grille':
          if (uv) applyGrille(mat, tc);
          break;
        case 'Poster_B':
          if (uv) applyPoster(mat, tc);
          break;
        case 'Window_Night':
          if (uv) applyWindowNight(mat, tc);
          break;
        default:
          if (PLASTIC_MATERIALS.has(name) && uv) applyPlastic(mat, tc);
          else if (FABRIC_MATERIALS.has(name) && uv) applyFabric(mat, tc);
          else done.delete(mat);
      }
      mat.needsUpdate = true;
    }
  });
  return created;
}
