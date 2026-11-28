import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PAD_IDLE } from '../../shared/utils/pad';
import { createCrtScreenMaterial } from './crt-shader';
import { PS1_BUTTON_BINDINGS } from './frame-color';
import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  blitFrameToDisplay,
  distanceToFitScreen,
} from './scene-helpers';
import { RoomLife, createRoomLife } from './room-life';
import { applyProceduralTextures } from './scene-textures';

export type CameraPreset = 'hero' | 'screen';

const HERO_SUBJECT = /^(TV_(?!Antenna)|CRT_|PS1_|Ctrl_|Btn_)/;

interface CameraPose {
  readonly pos: THREE.Vector3;
  readonly target: THREE.Vector3;
}

const CAMERA_FOV = 37;
// The city seen through the window reaches about 55 m away, its sky corners further
const CAMERA_FAR = 120;

// Placeholder poses used until the model is loaded and real poses are computed from it
const FALLBACK_POSES: Record<CameraPreset, CameraPose> = {
  hero: { pos: new THREE.Vector3(0.6, 0.8, 2.0), target: new THREE.Vector3(0, 0.45, 0) },
  screen: { pos: new THREE.Vector3(0, 0.5, 0.8), target: new THREE.Vector3(0, 0.5, 0) },
};

interface ScreenInfo {
  readonly center: THREE.Vector3;
  /** Horizontal unit vector pointing out of the glass toward the viewer. */
  readonly normal: THREE.Vector3;
  readonly width: number;
  readonly height: number;
}

const MODEL_URL = '/models/ps1-setup.glb';

interface AnimatedButton {
  readonly bit: number;
  readonly mesh: THREE.Object3D;
  readonly axis: 'y' | 'z';
  readonly rest: number;
  readonly delta: number;
  current: number;
}

/**
 * Lazy-loaded Three.js stage showing the Blender-modeled PlayStation 1 console,
 * controller (with live keyboard-driven button presses), and CRT television
 * displaying the live emulator canvas texture.
 */
@Component({
  selector: 'app-ps1-scene-3d',
  template: `
    <div #viewport class="viewport" data-testid="scene-3d" (pointerdown)="onInteract()">
      <!-- Disparaît au premier geste, au zoom télé, ou seule après quelques secondes. -->
      @if (!loadingModel() && !interacted() && !paused() && cameraPreset() !== 'screen') {
        <p class="hint" aria-hidden="true">
          <span><kbd>Glisser</kbd>tourner</span>
          <span><kbd>Molette</kbd>zoomer</span>
          <span><kbd>V</kbd>zoom télé</span>
        </p>
      }
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; height: 100%; }
    .viewport {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 0;
      background: #0b0b0c;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
    }
    .viewport:active { cursor: grabbing; }
    .hint {
      position: absolute;
      left: 50%;
      bottom: 14px;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px 14px;
      max-width: calc(100% - 24px);
      margin: 0;
      padding: 7px 12px;
      border: 1px solid #2f3138;
      border-radius: 3px;
      background: #0b0b0ce0;
      color: var(--gpc-spine-ink);
      font: 500 12px/1 Archivo, system-ui, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      transform: translateX(-50%);
      animation: hint-out 600ms ease-in 7s forwards;
    }
    .hint span { display: inline-flex; align-items: center; gap: 6px; }
    .hint kbd {
      padding: 3px 5px;
      border: 1px solid #454750;
      border-radius: 2px;
      background: #17181c;
      color: var(--gpc-spine-ink);
      font: 500 10px/1 var(--gpc-mono);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    @keyframes hint-out { to { opacity: 0; visibility: hidden; } }
    @media (max-width: 560px) { .hint { display: none; } }
    @media (prefers-reduced-motion: reduce) { .hint { animation-timing-function: step-end; } }
  `,
})
export class Ps1Scene3dComponent {
  private readonly viewportRef = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly destroyRef = inject(DestroyRef);

  /** Offscreen 2D canvas painted by the PS1 emulator core. */
  readonly sourceCanvas = input.required<HTMLCanvasElement>();
  /** Incremented every time the emulator draws a new frame to sourceCanvas. */
  readonly frameTick = input(0);
  /** Sampled average RGB [0..1] of the current frame to tint CRT light bounce. */
  readonly screenGlow = input<readonly [number, number, number]>([0.16, 0.22, 0.34]);
  /** Active-low 16-bit PS1 controller mask (0 = pressed, 0xFFFF = idle). */
  readonly pressedMask = input(PAD_IDLE);
  /** Whether the emulator is currently paused. */
  readonly paused = input(false);
  /** Active camera preset ('hero' desk view or 'screen' CRT close-up). */
  readonly cameraPreset = input<CameraPreset>('hero');
  /** Enables CRT scanlines, curvature & phosphor aperture shader. */
  readonly crtEffect = input(true);

  /** Emitted if WebGL cannot be initialized or the 3D asset fails to load. */
  readonly webglFailed = output<void>();
  /** Emitted once the living-room model is in the scene. */
  readonly ready = output<void>();

  readonly loadingModel = signal(true);
  readonly interacted = signal(false);

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private controls?: OrbitControls;
  private envTarget?: THREE.WebGLRenderTarget;
  private screenTexture?: THREE.CanvasTexture;
  private screenMaterial?: THREE.ShaderMaterial;
  private screenLight?: THREE.PointLight;
  private lampLight?: THREE.PointLight;
  private moonLight?: THREE.DirectionalLight;
  private displayCanvas?: HTMLCanvasElement;
  private displayCtx?: CanvasRenderingContext2D;
  private proceduralTextures: THREE.Texture[] = [];
  private roomLife?: RoomLife;
  private poses: Record<CameraPreset, CameraPose> = FALLBACK_POSES;
  private screenInfo?: ScreenInfo;
  private heroBox?: THREE.Box3;
  private powerLedMat?: THREE.MeshStandardMaterial;
  private buttons: AnimatedButton[] = [];
  private resizeObserver?: ResizeObserver;
  private rafHandle = 0;
  private disposed = false;

  // Camera smooth transition state
  private desiredPos?: THREE.Vector3;
  private desiredTarget?: THREE.Vector3;
  private readonly reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  private readonly targetGlowColor = new THREE.Color(0.2, 0.28, 0.42);
  private readonly currentGlowColor = new THREE.Color(0.2, 0.28, 0.42);
  private signalStrength = 0;
  private hasReceivedFrame = false;

  constructor() {
    afterNextRender(() => {
      this.initScene();
    });

    // Mark CanvasTexture dirty whenever the emulator renders a new frame.
    effect(() => {
      const tick = this.frameTick();
      if (tick > 0 && this.screenTexture) {
        this.blitFrame();
        this.hasReceivedFrame = true;
      }
    });

    // Update dynamic CRT light bounce tint from sampled frame color.
    effect(() => {
      const [r, g, b] = this.screenGlow();
      // Keep a soft minimum ambient glow so dark screens still feel alive
      this.targetGlowColor.setRGB(0.08 + r * 0.92, 0.1 + g * 0.9, 0.14 + b * 0.86);
    });

    // Update CRT scanline uniform.
    effect(() => {
      const enabled = this.crtEffect();
      if (this.screenMaterial) {
        this.screenMaterial.uniforms['uScanlines'].value = enabled ? 1.0 : 0.0;
      }
    });

    // Update pause state on CRT shader and PS1 console power LED.
    effect(() => {
      const isPaused = this.paused();
      if (this.screenMaterial) {
        this.screenMaterial.uniforms['uPaused'].value = isPaused ? 1.0 : 0.0;
      }
      if (this.powerLedMat) {
        if (isPaused) {
          this.powerLedMat.color.setHex(0xe59824);
          this.powerLedMat.emissive.setHex(0xf0a030);
          this.powerLedMat.emissiveIntensity = 1.6;
        } else {
          this.powerLedMat.color.setHex(0x16e054);
          this.powerLedMat.emissive.setHex(0x18ff58);
          this.powerLedMat.emissiveIntensity = 3.2;
        }
      }
    });

    // Trigger camera transition when cameraPreset input changes.
    effect(() => {
      const preset = this.cameraPreset();
      this.applyCameraPreset(preset);
    });

    this.destroyRef.onDestroy(() => this.dispose());
  }

  onInteract(): void {
    this.interacted.set(true);
    // Let the user take immediate control if a camera glide was underway
    this.desiredPos = undefined;
    this.desiredTarget = undefined;
  }

  private initScene(): void {
    const container = this.viewportRef().nativeElement;
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      console.error('[Ps1Scene3d] WebGL indisponible', error);
      this.webglFailed.emit();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('aria-label', 'Scène 3D : PlayStation 1, manette et téléviseur CRT');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0b0c');
    scene.fog = new THREE.Fog('#0b0b0c', 5, 14);
    this.scene = scene;

    // Subtle studio reflections via RoomEnvironment (no external HDRI required)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = 0.12;
    envScene.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.02, CAMERA_FAR);
    const initialPose = this.poses[this.cameraPreset()];
    camera.position.copy(initialPose.pos);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(initialPose.target);
    controls.enableDamping = !this.reducedMotion;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.4;
    controls.maxDistance = 2.6;
    controls.minAzimuthAngle = -Math.PI * 0.45;
    controls.maxAzimuthAngle = Math.PI * 0.45;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();
    this.controls = controls;

    // Night living room: faint ambient, warm table lamp, cool moonlight, CRT bounce
    scene.add(new THREE.HemisphereLight(0x8d9bc4, 0x1a1512, 0.14));

    const lamp = new THREE.PointLight(0xffb36b, 3.2, 7, 2);
    lamp.position.set(-1, 1, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.near = 0.05;
    lamp.shadow.camera.far = 8;
    lamp.shadow.bias = -0.0008;
    lamp.shadow.normalBias = 0.02;
    scene.add(lamp);
    this.lampLight = lamp;

    const moon = new THREE.DirectionalLight(0x7f9ae0, 0.35);
    moon.position.set(-2, 2, -1);
    scene.add(moon, moon.target);
    this.moonLight = moon;

    // Dynamic bounce light from the CRT glass (repositioned once the model is loaded)
    const screenLight = new THREE.PointLight(0x6688cc, 0.55, 3.2, 1.6);
    screenLight.position.set(0, 0.5, 0.4);
    scene.add(screenLight);
    this.screenLight = screenLight;

    // Fixed-size 4:3 display canvas: the CanvasTexture keeps its first GPU size, so the
    // emulator canvas (which changes resolution) is stretched onto this one each frame.
    const display = document.createElement('canvas');
    display.width = DISPLAY_WIDTH;
    display.height = DISPLAY_HEIGHT;
    this.displayCanvas = display;
    this.displayCtx = display.getContext('2d') ?? undefined;
    this.displayCtx?.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);

    // Live CanvasTexture from the emulator's offscreen canvas
    const texture = new THREE.CanvasTexture(display);
    // glTF UV origin is top-left (matching HTML Canvas row 0) so flipY must be false
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    if (this.frameTick() > 0) {
      this.blitFrame();
      this.hasReceivedFrame = true;
    }
    this.screenTexture = texture;

    const crtMat = createCrtScreenMaterial(texture);
    crtMat.uniforms['uScanlines'].value = this.crtEffect() ? 1.0 : 0.0;
    crtMat.uniforms['uPaused'].value = this.paused() ? 1.0 : 0.0;
    this.screenMaterial = crtMat;

    // Keep renderer crisp on container or fullscreen resize
    this.resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 2 || rect.height < 2 || !this.renderer || !this.camera) return;
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rect.width, rect.height, false);
      if (this.screenInfo) {
        this.poses = { ...this.poses, screen: this.computeScreenPose(this.screenInfo) };
        if (this.cameraPreset() === 'screen') this.applyCameraPreset('screen');
      }
    });
    this.resizeObserver.observe(container);

    // Load Blender-modeled PS1 console + controller + CRT TV scene
    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (this.disposed) return;
        this.setupModel(gltf.scene);
        scene.add(gltf.scene);
        this.roomLife = createRoomLife(gltf.scene, {
          reducedMotion: this.reducedMotion,
          anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
          pixelRatio: renderer.getPixelRatio(),
        });
        this.positionLightsAndPoses(gltf.scene);
        this.applyCameraPreset(this.cameraPreset(), true);
        this.loadingModel.set(false);
        this.ready.emit();
      },
      undefined,
      (error) => {
        if (this.disposed) return;
        console.error('[Ps1Scene3d] Chargement du modèle 3D impossible', error);
        this.loadingModel.set(false);
        this.webglFailed.emit();
      },
    );

    // Render loop (camera damping, smooth button presses, CRT bounce & shader uniforms)
    let lastTime = performance.now();
    const renderLoop = (now: number) => {
      if (this.disposed) return;
      this.rafHandle = requestAnimationFrame(renderLoop);
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Smooth CRT warm-up when frames start flowing
      if (this.hasReceivedFrame && this.signalStrength < 1) {
        this.signalStrength = this.reducedMotion ? 1 : Math.min(1, this.signalStrength + dt * 2.8);
      }
      if (this.screenMaterial) {
        this.screenMaterial.uniforms['uTime'].value = this.reducedMotion ? 0 : now * 0.001;
        this.screenMaterial.uniforms['uSignal'].value = this.signalStrength;
      }

      // Smooth dynamic CRT screen bounce light
      if (this.screenLight) {
        this.currentGlowColor.lerp(this.targetGlowColor, Math.min(1, dt * 7));
        this.screenLight.color.copy(this.currentGlowColor);
        const lum =
          this.currentGlowColor.r * 0.3 +
          this.currentGlowColor.g * 0.59 +
          this.currentGlowColor.b * 0.11;
        const targetIntensity = (this.paused() ? 0.4 : 0.8 + lum * 1.4) * (0.25 + 0.75 * this.signalStrength);
        this.screenLight.intensity += (targetIntensity - this.screenLight.intensity) * Math.min(1, dt * 8);
      }

      // Smoothly animate the 14 individual PS1 controller buttons from pressedMask
      const mask = this.pressedMask();
      const btnSpeed = this.reducedMotion ? 1 : Math.min(1, dt * 28);
      for (const btn of this.buttons) {
        const pressed = (mask & (1 << btn.bit)) === 0;
        const target = pressed ? btn.delta : 0;
        btn.current += (target - btn.current) * btnSpeed;
        btn.mesh.position[btn.axis] = btn.rest + btn.current;
      }

      // Smooth camera preset glide
      if (this.desiredPos && this.desiredTarget && this.camera && this.controls) {
        const alpha = this.reducedMotion ? 1 : Math.min(1, dt * 6.5);
        this.camera.position.lerp(this.desiredPos, alpha);
        this.controls.target.lerp(this.desiredTarget, alpha);
        if (
          this.camera.position.distanceToSquared(this.desiredPos) < 1e-6 &&
          this.controls.target.distanceToSquared(this.desiredTarget) < 1e-6
        ) {
          this.camera.position.copy(this.desiredPos);
          this.controls.target.copy(this.desiredTarget);
          this.desiredPos = undefined;
          this.desiredTarget = undefined;
        }
      }

      this.roomLife?.update(now / 1000, new Date());
      controls.update();
      // Never let the camera sink under the floor
      if (camera.position.y < 0.08) camera.position.y = 0.08;
      renderer.render(scene, camera);
    };
    this.rafHandle = requestAnimationFrame(renderLoop);
  }
  private blitFrame(): void {
    if (!this.displayCtx || !this.screenTexture) return;
    if (blitFrameToDisplay(this.displayCtx, this.sourceCanvas())) {
      this.screenTexture.needsUpdate = true;
    }
  }

  private setupModel(root: THREE.Group): void {
    const bindingByName = new Map(PS1_BUTTON_BINDINGS.map((b) => [b.meshName, b]));
    this.buttons = [];

    if (this.renderer) {
      this.proceduralTextures = applyProceduralTextures(
        root,
        Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      );
    }

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const isRoom = obj.name.startsWith('Room_');
        const isScreen = obj.name === 'CRT_Screen';
        // The lamp shade surrounds the point light, so it must not block it
        obj.castShadow = !isRoom && !isScreen && obj.name !== 'Lamp_Shade';
        obj.receiveShadow = !isScreen;

        if (isScreen && this.screenMaterial) {
          // Dispose placeholder screen material from GLB before applying live CRT shader
          const oldMats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of oldMats) m?.dispose();
          obj.material = this.screenMaterial;
        } else if (obj.name === 'PS1_PowerLED' && obj.material instanceof THREE.MeshStandardMaterial) {
          this.powerLedMat = obj.material;
          this.powerLedMat.emissive.setHex(this.paused() ? 0xf0a030 : 0x18ff58);
          this.powerLedMat.emissiveIntensity = this.paused() ? 1.6 : 3.2;
        }
      }

      const binding = bindingByName.get(obj.name);
      if (binding) {
        this.buttons.push({
          bit: binding.bit,
          mesh: obj,
          axis: binding.axis,
          rest: obj.position[binding.axis],
          delta: binding.delta,
          current: 0,
        });
      }
    });
  }

  /** Places lights and computes camera poses from the loaded model's world-space bounds. */
  private positionLightsAndPoses(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const heroBox = new THREE.Box3();
    let screen: THREE.Mesh | undefined;
    let shade: THREE.Object3D | undefined;
    let glass: THREE.Object3D | undefined;
    root.traverse((obj) => {
      if (obj.name === 'CRT_Screen' && obj instanceof THREE.Mesh) screen = obj;
      else if (obj.name === 'Lamp_Shade') shade ??= obj;
      else if (obj.name === 'Window_Glass') glass ??= obj;
      // The hero shot frames the playing setup only (TV, console, pad), not the decor around it
      if (obj instanceof THREE.Mesh && HERO_SUBJECT.test(obj.name)) heroBox.expandByObject(obj);
    });
    box.expandByObject(root);
    if (heroBox.isEmpty()) heroBox.copy(box);
    this.heroBox = heroBox;

    if (shade && this.lampLight) {
      new THREE.Box3().setFromObject(shade).getCenter(this.lampLight.position);
    } else if (this.lampLight) {
      this.lampLight.position.set(box.min.x + 0.5, box.min.y + 1.0, box.min.z + 0.5);
    }

    const roomCenter = box.getCenter(new THREE.Vector3());
    if (this.moonLight) {
      if (glass) new THREE.Box3().setFromObject(glass).getCenter(this.moonLight.position);
      else this.moonLight.position.set(box.min.x, box.max.y, box.min.z);
      this.moonLight.target.position.copy(roomCenter);
      this.moonLight.target.position.y = box.min.y;
    }

    if (screen) {
      const info = this.measureScreen(screen);
      this.screenInfo = info;
      if (this.screenLight) {
        // In front of the glass and slightly lowered, so it lights the console and rug
        this.screenLight.position.copy(info.center).addScaledVector(info.normal, 0.45);
        this.screenLight.position.y -= info.height * 0.25;
      }
    }

    this.poses = {
      hero: this.computeHeroPose(heroBox),
      screen: this.screenInfo ? this.computeScreenPose(this.screenInfo) : FALLBACK_POSES.screen,
    };
  }

  private measureScreen(mesh: THREE.Mesh): ScreenInfo {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());

    // Average vertex normal in world space gives the outward direction of the curved glass
    const normal = new THREE.Vector3();
    const attr = mesh.geometry.getAttribute('normal');
    if (attr) {
      const n = new THREE.Vector3();
      for (let i = 0; i < attr.count; i++) normal.add(n.fromBufferAttribute(attr, i));
      normal.transformDirection(mesh.matrixWorld);
    }
    normal.y = 0;
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();

    // Glass width is the horizontal extent perpendicular to the normal
    const width = Math.abs(normal.z) >= Math.abs(normal.x) ? size.x : size.z;
    return { center, normal, width, height: size.y };
  }

  private computeScreenPose(info: ScreenInfo): CameraPose {
    const aspect = this.camera?.aspect ?? 16 / 9;
    const dist = distanceToFitScreen(info.height, info.width, CAMERA_FOV, aspect, 0.85);
    return {
      pos: info.center.clone().addScaledVector(info.normal, dist),
      target: info.center.clone(),
    };
  }

  private computeHeroPose(box: THREE.Box3): CameraPose {
    const size = box.getSize(new THREE.Vector3());
    const target = box.getCenter(new THREE.Vector3());
    target.y -= size.y * 0.12;
    // Three-quarter view from the sofa: toward the front (+z), a little to the right, raised
    const dir = new THREE.Vector3(0.3, 0, 1).normalize();
    const halfTan = Math.tan((CAMERA_FOV * Math.PI) / 360);
    const dist = THREE.MathUtils.clamp((Math.max(size.x, size.y * 1.4) / 2 / halfTan) * 1.05, 1.1, 2.4);
    const pos = target.clone().addScaledVector(dir, dist);
    pos.y = Math.max(0.75, box.min.y + 0.75);
    return { pos, target };
  }

  private applyCameraPreset(preset: CameraPreset, snap = false): void {
    const pose = this.poses[preset];
    if (!this.camera || !this.controls) return;
    if (this.reducedMotion || snap) {
      this.camera.position.copy(pose.pos);
      this.controls.target.copy(pose.target);
      this.controls.update();
      this.desiredPos = undefined;
      this.desiredTarget = undefined;
      return;
    }
    this.desiredPos = pose.pos.clone();
    this.desiredTarget = pose.target.clone();
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.rafHandle);
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    this.controls?.dispose();
    this.controls = undefined;

    if (this.scene) {
      const disposedMats = new Set<THREE.Material>();
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat || disposedMats.has(mat)) continue;
            disposedMats.add(mat);
            for (const value of Object.values(mat)) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            mat.dispose();
          }
        }
      });
      this.scene.clear();
      this.scene = undefined;
    }

    this.roomLife?.dispose();
    this.roomLife = undefined;
    for (const tex of this.proceduralTextures) tex.dispose();
    this.proceduralTextures = [];
    this.screenTexture?.dispose();
    this.screenTexture = undefined;
    this.displayCanvas = undefined;
    this.displayCtx = undefined;
    this.lampLight?.shadow.dispose();
    this.lampLight = undefined;
    this.moonLight = undefined;
    this.screenLight = undefined;
    this.screenMaterial?.dispose();
    this.screenMaterial = undefined;
    this.envTarget?.dispose();
    this.envTarget = undefined;

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = undefined;
    }
    this.buttons = [];
  }
}
