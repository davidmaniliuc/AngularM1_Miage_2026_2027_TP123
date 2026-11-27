import { HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BiosService } from '../../shared/services/bios.service';
import { EmulatorService } from '../../shared/services/emulator.service';
import { GameService } from '../../shared/services/game.service';
import { SaveService } from '../../shared/services/save.service';
import { PAD_BUTTONS, PAD_IDLE } from '../../shared/utils/pad';
import { PS1_BUTTON_BINDINGS, sampleFrameColor } from './frame-color';
import { GamePlayComponent } from './game-play';
import {
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  blitFrameToDisplay,
  distanceToFitScreen,
  hashString,
  mulberry32,
} from './scene-helpers';

describe('frame-color helpers', () => {
  it('samples average normalized RGB from an RGBA frame buffer', () => {
    const width = 8;
    const height = 8;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255;
      rgba[i + 1] = 128;
      rgba[i + 2] = 0;
      rgba[i + 3] = 255;
    }
    const [r, g, b] = sampleFrameColor(rgba, width, height);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(128 / 255, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('returns a safe default color for empty frame buffers', () => {
    const [r, g, b] = sampleFrameColor(new Uint8ClampedArray(0), 0, 0);
    expect(r).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
  });

  it('binds every PS1 pad button to a unique 3D controller mesh', () => {
    const boundBits = new Set(PS1_BUTTON_BINDINGS.map((b) => b.bit));
    const meshNames = new Set(PS1_BUTTON_BINDINGS.map((b) => b.meshName));
    expect(meshNames.size).toBe(PS1_BUTTON_BINDINGS.length);
    for (const button of PAD_BUTTONS) {
      expect(boundBits.has(button.bit)).toBe(true);
    }
  });
});

describe('GamePlayComponent', () => {
  const gameService = {
    get: vi.fn(),
    disc: vi.fn(),
  };
  const biosService = {
    list: vi.fn(),
    file: vi.fn(),
  };
  const saveService = {
    load: vi.fn(),
    save: vi.fn(),
  };
  const emulatorService = {
    create: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    saveService.load.mockReturnValue(of(null));
    saveService.save.mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [GamePlayComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', 'g1']]) } },
        },
        { provide: GameService, useValue: gameService },
        { provide: BiosService, useValue: biosService },
        { provide: SaveService, useValue: saveService },
        { provide: EmulatorService, useValue: emulatorService },
      ],
    });
  });

  it('shows a clear message when the game has no disc', async () => {
    gameService.get.mockReturnValue(
      of({ id: 'g1', title: 'Ridge Racer', serial: 'SCES-00001', favorite: false, compat: 'untested' }),
    );
    const fixture = TestBed.createComponent(GamePlayComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toContain("n'a pas de fichier");
    expect(fixture.nativeElement.querySelector('[data-testid="error"]')?.textContent).toContain("n'a pas de fichier");
  });

  it('shows a clear message and BIOS link when no BIOS exists', async () => {
    gameService.get.mockReturnValue(
      of({
        id: 'g1',
        title: 'Ridge Racer',
        serial: 'SCES-00001',
        favorite: false,
        compat: 'untested',
        disc: { name: 'rr.chd', size: 1024, kind: 'chd' },
      }),
    );
    biosService.list.mockReturnValue(of([]));

    const fixture = TestBed.createComponent(GamePlayComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(fixture.componentInstance.missingBios()).toBe(true);
    expect(fixture.componentInstance.error()).toContain('Aucun BIOS');
    expect(fixture.nativeElement.querySelector('a[href="/games/bios"]')).toBeTruthy();
  });

  it('toggles 3D camera zoom, CRT filter, 2D mode, and falls back gracefully on WebGL failure', async () => {
    const fakeCore = {
      isPal: false,
      setCpuEngine: vi.fn(),
      loadBios: vi.fn(),
      loadDisc: vi.fn(),
      loadMemcard: vi.fn(),
      loadState: vi.fn(),
      takeMemcard: vi.fn().mockReturnValue(undefined),
      setButtons: vi.fn(),
      runFrame: vi.fn(),
      frame: vi.fn().mockReturnValue({ rgba: new Uint8ClampedArray(4), width: 1, height: 1 }),
      readAudio: vi.fn().mockReturnValue(new Float32Array(0)),
      reset: vi.fn(),
    };

    // Provide minimal canvas 2D & AudioContext mocks for jsdom
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    const origAudioCtx = globalThis.AudioContext;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ putImageData: vi.fn() }) as unknown as typeof origGetContext;
    globalThis.AudioContext = class {
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      suspend = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      createBuffer = vi.fn();
      createBufferSource = vi.fn();
    } as unknown as typeof AudioContext;

    try {
      gameService.get.mockReturnValue(
        of({
          id: 'g1',
          title: 'Wipeout',
          serial: 'SCES-00010',
          favorite: false,
          compat: 'works',
          disc: { name: 'wipeout.chd', size: 16, kind: 'chd' },
        }),
      );
      biosService.list.mockReturnValue(
        of([{ id: 'b1', name: 'SCPH1001.BIN', region: 'NTSC-U', sha256: 'abc', isDefault: true }]),
      );
      biosService.file.mockReturnValue(of(new Blob([new Uint8Array(16)])));
      gameService.disc.mockReturnValue(of(new HttpResponse({ body: new Blob([new Uint8Array(16)]) })));
      emulatorService.create.mockResolvedValue(fakeCore);

      const fixture = TestBed.createComponent(GamePlayComponent);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 20));
      fixture.detectChanges();

      expect(cmp.running()).toBe(true);
      expect(cmp.viewMode()).toBe('3d');
      expect(cmp.cameraPreset()).toBe('hero');
      expect(cmp.crtEffect()).toBe(true);

      // Camera preset toggle (also triggered via KeyV)
      cmp.toggleCameraPreset();
      expect(cmp.cameraPreset()).toBe('screen');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      expect(cmp.cameraPreset()).toBe('hero');

      // CRT filter toggle
      cmp.toggleCrt();
      expect(cmp.crtEffect()).toBe(false);

      // Keyboard pad press updates pressedMask for the 3D PS1 controller
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
      expect(cmp.pressedMask()).not.toBe(PAD_IDLE);
      expect(cmp.pressedMask() & (1 << 14)).toBe(0);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
      expect(cmp.pressedMask()).toBe(PAD_IDLE);

      // Toggle 2D/3D and verify graceful WebGL fallback
      cmp.toggleViewMode();
      expect(cmp.viewMode()).toBe('2d');
      cmp.toggleViewMode();
      expect(cmp.viewMode()).toBe('3d');

      cmp.onWebglFailed();
      expect(cmp.webglUnavailable()).toBe(true);
      expect(cmp.viewMode()).toBe('2d');
      expect(cmp.notice()).toContain('écran 2D');

      fixture.destroy();
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
      globalThis.AudioContext = origAudioCtx;
    }
  });
});

describe('scene helpers', () => {
  it('stretches any emulator resolution onto the fixed 4:3 display canvas', () => {
    const calls: unknown[][] = [];
    const ctx = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => calls.push(args),
    };
    for (const [w, h] of [[320, 240], [512, 240], [640, 480]]) {
      expect(blitFrameToDisplay(ctx, { width: w, height: h })).toBe(true);
    }
    expect(ctx.imageSmoothingEnabled).toBe(false);
    for (const call of calls) expect(call.slice(1)).toEqual([0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT]);
    expect(DISPLAY_WIDTH / DISPLAY_HEIGHT).toBeCloseTo(4 / 3, 5);
  });

  it('skips blitting an empty source canvas', () => {
    const ctx = { imageSmoothingEnabled: true, drawImage: vi.fn() };
    expect(blitFrameToDisplay(ctx, { width: 0, height: 0 })).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('computes a camera distance that fills the requested viewport height', () => {
    const fov = 37;
    const dist = distanceToFitScreen(0.4, 0.53, fov, 16 / 9, 0.85);
    const visible = 2 * dist * Math.tan((fov * Math.PI) / 360);
    expect(0.4 / visible).toBeCloseTo(0.85, 2);
    // A narrow viewport is limited by width instead
    expect(distanceToFitScreen(0.4, 0.53, fov, 0.5, 0.85)).toBeGreaterThan(dist);
  });

  it('seeds a deterministic PRNG', () => {
    const a = mulberry32(hashString('Floor_Oak'));
    const b = mulberry32(hashString('Floor_Oak'));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
