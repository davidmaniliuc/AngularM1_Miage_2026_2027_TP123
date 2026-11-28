import * as THREE from 'three';
import { hashString, mulberry32 } from './scene-helpers';
import { makeCanvas } from './scene-textures';

/**
 * The living parts of the room, bound by glTF node name after load:
 * the night city seen through the window (every `Outside_*` node) and the wall clock.
 *
 * Every `Outside_*` material becomes unlit and fog-free, because the outside sits
 * 10 to 40 m away, beyond the room's fog range, and is lit by itself, not by the room.
 */
export interface RoomLife {
  /** `seconds` is any monotonic clock, `now` the wall-clock time shown by the clock. */
  update(seconds: number, now: Date): void;
  dispose(): void;
}

export interface RoomLifeOptions {
  readonly reducedMotion: boolean;
  readonly anisotropy: number;
  readonly pixelRatio: number;
}

/** Called every frame; `seconds` stays at 0 under reduced motion so every element holds a still pose. */
type Animate = (seconds: number, now: Date) => void;

interface LifeKit extends RoomLifeOptions {
  texture(canvas: HTMLCanvasElement, wrap?: boolean): THREE.CanvasTexture;
  own(resource: { dispose(): void }): void;
  find(name: string): THREE.Object3D | undefined;
  rng: () => number;
}

type Binding = (mesh: THREE.Mesh, kit: LifeKit) => Animate | void;

const OUTSIDE_PREFIX = 'Outside_';

const BINDINGS: Readonly<Record<string, Binding>> = {
  Outside_Sky: bindSky,
  Outside_Moon: bindMoon,
  Outside_MoonHalo: bindMoonHalo,
  Outside_Clouds: bindClouds,
  Outside_Buildings_Near: (mesh, kit) => bindFacade(mesh, kit, FACADES.near),
  Outside_Buildings_Mid: (mesh, kit) => bindFacade(mesh, kit, FACADES.mid),
  Outside_Buildings_Far: (mesh, kit) => bindFacade(mesh, kit, FACADES.far),
  Outside_AviationLight: bindAviationLight,
  Clock_Dial: bindClockDial,
  Clock_HandHour: (mesh) => clockHand(mesh, (now) => (now.getHours() % 12) / 12 + now.getMinutes() / 720),
  Clock_HandMinute: (mesh) => clockHand(mesh, (now) => now.getMinutes() / 60 + now.getSeconds() / 3600),
  Clock_HandSecond: bindSecondHand,
};

export function createRoomLife(root: THREE.Object3D, options: RoomLifeOptions): RoomLife {
  root.updateMatrixWorld(true);
  const owned: Array<{ dispose(): void }> = [];
  const animators: Animate[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });

  for (const mesh of meshes) {
    if (mesh.name.startsWith(OUTSIDE_PREFIX)) makeOutside(mesh, owned);
    const bind = BINDINGS[mesh.name];
    if (!bind) continue;
    const kit: LifeKit = {
      ...options,
      rng: mulberry32(hashString(mesh.name)),
      own: (resource) => owned.push(resource),
      find: (name) => root.getObjectByName(name),
      texture: (canvas, wrap = false) => {
        const tex = new THREE.CanvasTexture(canvas);
        // glTF UVs have their origin top-left, matching canvas row 0
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = options.anisotropy;
        if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        owned.push(tex);
        return tex;
      },
    };
    const animate = bind(mesh, kit);
    if (animate) animators.push(animate);
  }

  return {
    update(seconds, now) {
      const t = options.reducedMotion ? 0 : seconds;
      for (const animate of animators) animate(t, now);
    },
    dispose() {
      for (const resource of owned) resource.dispose();
      owned.length = 0;
      animators.length = 0;
    },
  };
}

/** Swaps the glTF material for an unlit, fog-free one that keeps its colour and transparency. */
function makeOutside(mesh: THREE.Mesh, owned: Array<{ dispose(): void }>): void {
  const old = mesh.material as THREE.MeshStandardMaterial;
  const basic = new THREE.MeshBasicMaterial({
    name: old.name,
    color: old.emissive.clone().multiplyScalar(old.emissiveIntensity),
    transparent: old.transparent,
    opacity: old.opacity,
    depthWrite: !old.transparent,
    fog: false,
  });
  old.dispose();
  mesh.material = basic;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  owned.push(basic);
}

function basicOf(mesh: THREE.Mesh): THREE.MeshBasicMaterial {
  return mesh.material as THREE.MeshBasicMaterial;
}

function worldBox(mesh: THREE.Mesh): THREE.Box3 {
  return new THREE.Box3().setFromObject(mesh);
}

/** Canvas row of a world height on a mesh whose UVs span its bounds top to bottom. */
function rowOf(box: THREE.Box3, worldY: number, height: number): number {
  return ((box.max.y - worldY) / (box.max.y - box.min.y)) * height;
}

// ---------------------------------------------------------------- sky, stars, moon, clouds

function bindSky(mesh: THREE.Mesh, kit: LifeKit): Animate {
  const box = worldBox(mesh);
  const H = 512;
  const [canvas, ctx] = makeCanvas(16, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const stop = (y: number, color: string) =>
    g.addColorStop(THREE.MathUtils.clamp(rowOf(box, y, H) / H, 0, 1), color);
  stop(box.max.y, '#02040b');
  stop(18, '#050a1c');
  stop(7, '#0b1430');
  stop(2.5, '#1c2245');
  // City glow just above the rooftops
  stop(0.5, '#3b3150');
  stop(-4, '#4a3446');
  stop(box.min.y, '#1a1420');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, H);
  const mat = basicOf(mesh);
  mat.map = kit.texture(canvas);
  mat.color.set(0xffffff);
  return addStars(mesh, box, kit);
}

/** Star field just in front of the sky plane; each star twinkles at its own rate. */
function addStars(sky: THREE.Mesh, box: THREE.Box3, kit: LifeKit): Animate {
  const count = 1400;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const inFront = box.getCenter(new THREE.Vector3()).x < 0 ? box.max.x + 0.3 : box.min.x - 0.3;
  const low = Math.max(box.min.y, 2);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = inFront;
    positions[i * 3 + 1] = low + (box.max.y - low) * Math.pow(kit.rng(), 0.85);
    positions[i * 3 + 2] = box.min.z + (box.max.z - box.min.z) * kit.rng();
    seeds[i] = kit.rng();
    sizes[i] = (kit.rng() > 0.92 ? 2.6 : 1.4 + kit.rng()) * kit.pixelRatio;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.62 + 0.38 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 61.0);
        vAlpha = (0.3 + 0.7 * fract(aSeed * 7.13)) * twinkle;
        gl_PointSize = aSize;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(0.86, 0.9, 1.0, vAlpha * smoothstep(0.5, 0.15, d));
      }`,
    transparent: true,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Outside_Stars';
  stars.frustumCulled = false;
  sky.parent?.add(stars);
  kit.own(geometry);
  kit.own(material);
  kit.own({ dispose: () => stars.removeFromParent() });
  return (seconds) => {
    material.uniforms['uTime'].value = seconds;
  };
}

function bindMoon(mesh: THREE.Mesh, kit: LifeKit): void {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const c = S / 2;
  const disc = ctx.createRadialGradient(c - 20, c - 20, 10, c, c, c);
  disc.addColorStop(0, '#fbf7ea');
  disc.addColorStop(0.8, '#e6e0cc');
  disc.addColorStop(1, '#b9b3a2');
  ctx.fillStyle = disc;
  ctx.fillRect(0, 0, S, S);
  // Maria: a few soft grey patches
  for (const [x, y, r] of [
    [0.38, 0.36, 0.16],
    [0.6, 0.3, 0.11],
    [0.56, 0.55, 0.14],
    [0.34, 0.62, 0.09],
    [0.7, 0.66, 0.07],
  ]) {
    const m = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
    m.addColorStop(0, 'rgba(140,138,128,0.55)');
    m.addColorStop(1, 'rgba(140,138,128,0)');
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, S, S);
  }
  const mat = basicOf(mesh);
  mat.map = kit.texture(canvas);
  mat.color.setScalar(1.15);
}

function bindMoonHalo(mesh: THREE.Mesh, kit: LifeKit): void {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(190,205,240,0.5)');
  g.addColorStop(0.25, 'rgba(150,170,220,0.18)');
  g.addColorStop(1, 'rgba(120,140,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const mat = basicOf(mesh);
  mat.map = kit.texture(canvas);
  mat.color.set(0xffffff);
  mat.opacity = 1;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
}

/** Thin moonlit cloud banks, mostly at the moon's height, tiling horizontally so they can drift. */
function bindClouds(mesh: THREE.Mesh, kit: LifeKit): Animate {
  const box = worldBox(mesh);
  const W = 1024;
  const H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  const moon = kit.find('Outside_Moon');
  const band = rowOf(box, (moon ? new THREE.Box3().setFromObject(moon) : box).getCenter(new THREE.Vector3()).y, H);
  for (let i = 0; i < 90; i++) {
    const y = band + (kit.rng() - 0.5) * (i < 60 ? 90 : 300);
    const x = kit.rng() * W;
    const rx = 40 + kit.rng() * 140;
    const ry = rx * (0.12 + kit.rng() * 0.12);
    for (const ox of [x - W, x, x + W]) {
      const g = ctx.createRadialGradient(ox, y, 0, ox, y, rx);
      g.addColorStop(0, `rgba(150,160,190,${0.1 + kit.rng() * 0.16})`);
      g.addColorStop(1, 'rgba(150,160,190,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(ox, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-ox, -y);
      ctx.fillRect(ox - rx, y - rx, rx * 2, rx * 2);
      ctx.restore();
    }
  }
  const tex = kit.texture(canvas, true);
  const mat = basicOf(mesh);
  mat.map = tex;
  mat.color.set(0xffffff);
  mat.opacity = 1;
  mat.transparent = true;
  mat.depthWrite = false;
  // About 0.3 m/s at 36 m: a slow drift that crosses the moon in a couple of minutes
  const speed = 0.3 / Math.max(1, box.max.z - box.min.z);
  return (seconds) => {
    tex.offset.x = (seconds * speed) % 1;
  };
}

// ---------------------------------------------------------------- city

interface FacadeStyle {
  readonly wall: string;
  readonly pane: string;
  readonly litRatio: number;
  /** Windows that switch on or off every few seconds (only the nearest buildings). */
  readonly live: boolean;
  readonly dim: number;
}

const FACADES = {
  near: { wall: '#0b0d14', pane: '#161b28', litRatio: 0.3, live: true, dim: 1 },
  mid: { wall: '#121729', pane: '#1b2236', litRatio: 0.25, live: false, dim: 0.85 },
  far: { wall: '#1b2138', pane: '#222a42', litRatio: 0.2, live: false, dim: 0.7 },
} as const satisfies Record<string, FacadeStyle>;

const WINDOW_LIGHTS = ['#ffd08a', '#f3b768', '#ffe2b0', '#a9bcff', '#c98d52'];

/** One facade tile is 12 m wide and 22.4 m tall: 14 window columns, 8 floors of 2.8 m. */
const TILE_W = 12;
const TILE_H = 22.4;
const COLS = 14;
const FLOORS = 8;

function bindFacade(mesh: THREE.Mesh, kit: LifeKit, style: FacadeStyle): void {
  const W = 512;
  const H = 768;
  const cw = W / COLS;
  const ch = H / FLOORS;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = style.wall;
  ctx.fillRect(0, 0, W, H);
  // 0 = dark, otherwise 1 + index into WINDOW_LIGHTS
  const cells = new Uint8Array(COLS * FLOORS);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = kit.rng() < style.litRatio ? 1 + Math.floor(kit.rng() * WINDOW_LIGHTS.length) : 0;
  }
  const paint = (i: number) => {
    const x = (i % COLS) * cw;
    const y = Math.floor(i / COLS) * ch;
    ctx.fillStyle = cells[i] ? WINDOW_LIGHTS[cells[i] - 1] : style.pane;
    ctx.globalAlpha = cells[i] ? style.dim : 1;
    ctx.fillRect(x + cw * 0.25, y + ch * 0.36, cw * 0.5, ch * 0.38);
    ctx.globalAlpha = 1;
  };
  for (let i = 0; i < cells.length; i++) paint(i);
  const tex = kit.texture(canvas, true);
  tex.repeat.set(1 / TILE_W, 1 / TILE_H);
  const mat = basicOf(mesh);
  mat.map = tex;
  mat.color.set(0xffffff);
  prepareFacadeGeometry(mesh.geometry);
  mat.vertexColors = true;
}

/**
 * Bakes a little directional shading so the faces turned toward the room read brighter than the
 * sides, and moves the roofs' UVs onto bare wall so no window is painted on a roof.
 */
function prepareFacadeGeometry(geometry: THREE.BufferGeometry): void {
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!normal || !uv) return;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const up = normal.getY(i) > 0.9;
    const shade = up ? 0.7 : 0.6 + 0.4 * Math.max(0, normal.getX(i));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
    if (up) uv.setXY(i, 0.01 * TILE_W, 0.01 * TILE_H);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function bindAviationLight(mesh: THREE.Mesh): void {
  basicOf(mesh).color.setRGB(3, 0.18, 0.08);
}

// ---------------------------------------------------------------- wall clock

/** A hand modelled pointing at 12, its origin on the dial centre; `turns` is the fraction of a full turn. */
function clockHand(mesh: THREE.Object3D, turns: (now: Date) => number): Animate {
  return (_seconds, now) => {
    mesh.rotation.z = -turns(now) * Math.PI * 2;
  };
}

/** A quartz second hand ticks once a second; under reduced motion the clock goes without one. */
function bindSecondHand(mesh: THREE.Mesh, kit: LifeKit): Animate | void {
  if (kit.reducedMotion) {
    mesh.visible = false;
    return;
  }
  return clockHand(mesh, (now) => now.getSeconds() / 60);
}

/** Cream dial with minute marks and bold numerals; UVs span the dial's bounds. */
function bindClockDial(mesh: THREE.Mesh, kit: LifeKit): void {
  const S = 512;
  const c = S / 2;
  const [canvas, ctx] = makeCanvas(S, S);
  const face = ctx.createRadialGradient(c, c * 0.8, 20, c, c, c);
  face.addColorStop(0, '#f3eee0');
  face.addColorStop(1, '#ddd5c2');
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#1b1b1d';
  ctx.lineCap = 'butt';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const hour = i % 5 === 0;
    const r0 = c * (hour ? 0.8 : 0.86);
    ctx.lineWidth = hour ? 9 : 3;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
    ctx.lineTo(c + Math.sin(a) * c * 0.93, c - Math.cos(a) * c * 0.93);
    ctx.stroke();
  }
  ctx.fillStyle = '#161618';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 48px "Helvetica Neue", Helvetica, Arial, sans-serif';
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    ctx.fillText(String(h), c + Math.sin(a) * c * 0.61, c - Math.cos(a) * c * 0.61 + 2);
  }
  ctx.fillStyle = '#6b665c';
  ctx.font = '500 20px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillText('QUARTZ', c, c + c * 0.34);
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.map = kit.texture(canvas);
  mat.color.set(0xffffff);
  mat.roughness = 0.55;
  mat.needsUpdate = true;
}
