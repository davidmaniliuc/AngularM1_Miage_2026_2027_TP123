import * as THREE from 'three';

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

/** A volume the camera must stay out of: an axis-aligned box in its own (possibly rotated) frame. */
export interface ColliderVolume {
  readonly box: THREE.Box3;
  /** Maps world space into the box's frame. */
  readonly worldToBox: THREE.Matrix4;
}

/**
 * Builds one volume per glTF `collider` extra (a name shared by several meshes): the union of
 * its meshes' bounds, expressed in the frame of its first mesh so a turned sofa keeps a tight box.
 */
export function collectColliders(root: THREE.Object3D): ColliderVolume[] {
  root.updateMatrixWorld(true);
  const volumes = new Map<string, ColliderVolume>();
  root.traverse((obj) => {
    const name = obj.userData['collider'];
    if (typeof name !== 'string' || !(obj instanceof THREE.Mesh)) return;
    let volume = volumes.get(name);
    if (!volume) {
      volume = { box: new THREE.Box3(), worldToBox: obj.matrixWorld.clone().invert() };
      volumes.set(name, volume);
    }
    obj.geometry.computeBoundingBox();
    const meshToBox = volume.worldToBox.clone().multiply(obj.matrixWorld);
    volume.box.union(obj.geometry.boundingBox!.clone().applyMatrix4(meshToBox));
  });
  return [...volumes.values()];
}

const armFrom = new THREE.Vector3();
const armTo = new THREE.Vector3();
const armHit = new THREE.Vector3();
const armRay = new THREE.Ray();

/**
 * Spring arm: the camera position on the target-to-`desired` segment, pulled toward the target to
 * `margin` before the first volume the segment enters. Volumes that contain the target are ignored.
 */
export function springArm(
  target: THREE.Vector3,
  desired: THREE.Vector3,
  volumes: readonly ColliderVolume[],
  margin: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const length = target.distanceTo(desired);
  let reach = length;
  for (const { box, worldToBox } of volumes) {
    armFrom.copy(target).applyMatrix4(worldToBox);
    if (box.containsPoint(armFrom)) continue;
    armTo.copy(desired).applyMatrix4(worldToBox).sub(armFrom);
    const span = armTo.length();
    if (span < 1e-9) continue;
    armRay.set(armFrom, armTo.divideScalar(span));
    if (!armRay.intersectBox(box, armHit)) continue;
    // A fraction along the segment survives the rigid change of frame
    const fraction = armFrom.distanceTo(armHit) / span;
    if (fraction < 1) reach = Math.min(reach, fraction * length - margin);
  }
  if (reach >= length) return out.copy(desired);
  return out.copy(target).lerp(desired, Math.max(0, reach) / length);
}
