import { HttpEventType } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { PadHelpDialogComponent } from './pad-help-dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AUDIO_SAMPLE_RATE, Ps1Core, Ps1Error, Ps1ErrorCode, toBytes } from '@davidmaniliuc/substation';
import { isPadKey, padMask, PAD_IDLE } from '../../shared/utils/pad';
import { firstValueFrom, Subscription } from 'rxjs';
import { Game } from '../../shared/models/game.model';
import { BiosService } from '../../shared/services/bios.service';
import { EmulatorService } from '../../shared/services/emulator.service';
import { SaveService } from '../../shared/services/save.service';
import { GameService } from '../../shared/services/game.service';

const MESSAGES: Partial<Record<Ps1ErrorCode, string>> = {
  BAD_BIOS_SIZE: "Ce BIOS n'est pas valide (il doit faire exactement 512 Ko).",
  BAD_CUE: "Le fichier .cue de ce jeu est illisible. Réimportez le jeu.",
  MULTI_FILE_CUE: 'Ce jeu a une piste par fichier .bin : convertissez-le en .chd puis réimportez-le.',
  BAD_CHD: "L'image .chd de ce jeu est invalide ou corrompue. Réimportez le jeu.",
  BAD_SBI: 'Le fichier de protection (.sbi) est invalide.',
  OOM: "La mémoire du navigateur est insuffisante pour ce jeu. Fermez d'autres onglets ou utilisez un .chd.",
  ENGINE_UNAVAILABLE: "Le moteur d'exécution demandé n'est pas disponible.",
  CRASHED: "L'émulateur a planté. Relancez le jeu.",
};

/** Page /games/:id/play: downloads the disc and the BIOS, then runs the emulator on a canvas. */
@Component({
  selector: 'app-game-play',
  imports: [RouterLink, MatIconModule, MatProgressBarModule],
  template: `
    <a [routerLink]="['/games', id]" class="back"><mat-icon>arrow_back</mat-icon>Quitter la partie</a>

    @if (error()) {
      <div class="error" role="alert" data-testid="error">
        <p>{{ error() }}</p>
        @if (missingBios()) {
          <a mat-flat-button routerLink="/games/bios">Gérer mes BIOS</a>
        }
      </div>
      <p class="notice" role="status" data-testid="notice">{{ notice() }}</p>
    }
    @if (status()) {
      <div class="loading">
        <p data-testid="status">{{ status() }}</p>
        <mat-progress-bar
          [mode]="progress() === undefined ? 'indeterminate' : 'determinate'"
          [value]="progress() ?? 0"
          aria-label="Progression du téléchargement"
        />
      </div>
    }
    <div #stage class="stage" [hidden]="!running()">
      <canvas #screen class="screen" aria-label="Écran du jeu" data-testid="screen"></canvas>
      @if (paused()) {
        <div class="overlay" data-testid="paused" aria-live="polite">Pause</div>
      }
    </div>
    @if (running()) {
      <div class="controls" role="toolbar" aria-label="Commandes de la partie">
        <button type="button" class="ctl cross" data-testid="pause" [attr.aria-pressed]="paused()" (click)="togglePause($event)">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            @if (paused()) { <path d="M11 8.5l13 7.5-13 7.5z" /> } @else { <path d="M11 8v16M21 8v16" /> }
          </svg>
          <span>{{ paused() ? 'Reprendre' : 'Pause' }}</span>
        </button>
        <button type="button" class="ctl circle" data-testid="reset" (click)="reset($event)">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M24.5 11A9.5 9.5 0 1 0 25.5 18" /><path d="M25 5v6.5h-6.5" /></svg>
          <span>Reset</span>
        </button>
        <button type="button" class="ctl triangle" data-testid="fullscreen" (click)="fullscreen($event)">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 12V5h7M20 5h7v7M27 20v7h-7M12 27H5v-7" /></svg>
          <span>Plein écran</span>
        </button>
        <button type="button" class="ctl cross" data-testid="save-state" (click)="saveState($event)">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 5h17l4 4v18H6z" /><path d="M11 5v7h9V5M10 27v-8h12v8" /></svg>
          <span>Sauvegarder</span>
        </button>
        <button type="button" class="ctl circle" data-testid="load-state" (click)="loadState($event)">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v15M9.500 14l6.500 6.500 6.500-6.500M6 25h20" /></svg>
          <span>Charger</span>
        </button>
        <button type="button" class="ctl square" data-testid="help" (click)="toggleHelp($event)">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 11h14a5 5 0 0 1 5 5v2a4 4 0 0 1-7 2.5l-1.5-2h-7L10 20.500A4 4 0 0 1 3 18v-2a5 5 0 0 1 5-5z" /><path d="M10 14v4M8 16h4" /><circle cx="22" cy="14.500" r="0.600" /><circle cx="24" cy="17" r="0.600" /></svg>
          <span>Touches</span>
        </button>
      </div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; color: var(--gpc-ink-soft); font-size: 14px; font-weight: 600; text-decoration: none; }
    .back:hover { color: var(--gpc-ink); }
    .back mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .loading { max-width: 480px; }
    .error { color: var(--mat-sys-error); }
    .stage { position: relative; width: min(100%, 960px); background: #000; }
    .stage:fullscreen { display: grid; place-items: center; width: 100vw; }
    .stage:fullscreen .screen { width: min(100vw, 133.33vh); }
    .overlay { position: absolute; inset: 0; display: grid; place-items: center; background: #0008; color: #fff; font-size: 28px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    .controls { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 16px; }
    .notice { min-height: 1.4em; margin: 12px 0 0; color: var(--gpc-ink-soft); font-size: 14px; }
    .ctl {
      display: grid;
      justify-items: center;
      gap: 6px;
      min-width: 64px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--gpc-ink-soft);
      font: 600 11px/1 var(--gpc-mono);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .ctl svg {
      box-sizing: border-box;
      width: 46px;
      height: 46px;
      padding: 9px;
      border: 1px solid var(--gpc-edge);
      border-radius: 50%;
      background: var(--gpc-inlay);
      box-shadow: inset 0 -3px 0 #0003, 0 6px 12px -8px #000b;
      fill: none;
      stroke: var(--ctl);
      stroke-width: 2.6;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 120ms, box-shadow 120ms, background-color 120ms;
    }
    .ctl circle { fill: var(--ctl); stroke: none; }
    .ctl:hover { color: var(--gpc-ink); }
    .ctl:hover svg { background: color-mix(in srgb, var(--ctl) 14%, var(--gpc-inlay)); }
    .ctl:active svg { transform: translateY(2px); box-shadow: inset 0 -1px 0 #0003; }
    .ctl:focus-visible { outline: none; }
    .ctl:focus-visible svg { outline: 2px solid var(--gpc-ps-cross); outline-offset: 2px; }
    .ctl.cross { --ctl: var(--gpc-ps-cross); }
    .ctl.circle { --ctl: var(--gpc-ps-circle); }
    .ctl.triangle { --ctl: var(--gpc-ps-triangle); }
    .ctl.square { --ctl: var(--gpc-ps-square); }
    @media (prefers-reduced-motion: reduce) { .ctl svg { transition: none; } }
    .screen { display: block; width: min(100%, 960px); aspect-ratio: 4 / 3; background: #000; image-rendering: pixelated; }
  `,
})
export class GamePlayComponent {
  private readonly games = inject(GameService);
  private readonly dialog = inject(MatDialog);
  private readonly saves = inject(SaveService);
  private readonly biosService = inject(BiosService);
  private readonly emulator = inject(EmulatorService);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('screen');

  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly status = signal('Préparation…');
  /** 0-100 while the size is known; undefined means indeterminate. */
  readonly progress = signal<number | undefined>(undefined);
  readonly error = signal('');
  readonly missingBios = signal(false);
  readonly running = signal(false);
  readonly paused = signal(false);
  /** Result of the last save or load: it never stops the game. */
  readonly notice = signal('');

  private core?: Ps1Core;
  private audio?: AudioContext;
  private frameHandle = 0;
  private download?: Subscription;
  private stopped = false;
  private cardTimer = 0;
  /** A card the game wrote that the server has not confirmed yet. */
  private pendingCard?: Uint8Array;
  private noticeTimer = 0;
  private nextAudio = 0;
  private held = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyP' && !event.repeat) this.togglePause();
    else if (event.code === 'KeyH' && !event.repeat) this.toggleHelp();
    else if (event.code === 'KeyK' && !event.repeat) this.saveState();
    else if (event.code === 'KeyL' && !event.repeat) this.loadState();
    else if (isPadKey(event.code) && !this.dialog.openDialogs.length) {
      // Arrows and Enter must not scroll the page or click a focused button.
      event.preventDefault();
      this.held.add(event.code);
      this.core?.setButtons(padMask(this.held));
    }
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (this.held.delete(event.code)) this.core?.setButtons(padMask(this.held));
  };
  /** A key released while the window had no focus would stay pressed. */
  private readonly releaseAll = () => {
    this.held.clear();
    this.core?.setButtons(PAD_IDLE);
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.releaseAll);
      if (document.fullscreenElement) void document.exitFullscreen();
      this.flushMemcard();
      this.stop();
    });
    void this.start().catch((error: unknown) => {
      if (this.stopped) return;
      console.error('[GamePlay] Lancement impossible', error);
      this.status.set('');
      this.error.set(this.messageOf(error));
    });
  }

  private async start(): Promise<void> {
    const game = await firstValueFrom(this.games.get(this.id));
    if (!game.disc) throw new Error('NO_DISC');
    const biosList = await firstValueFrom(this.biosService.list());
    const bios = biosList.find((item) => item.isDefault) ?? biosList[0];
    if (!bios) {
      this.missingBios.set(true);
      throw new Error('NO_BIOS');
    }

    const [core, biosBlob] = await Promise.all([this.emulator.create(), firstValueFrom(this.biosService.file(bios.id))]);
    this.core = core;
    const discBlob = await this.downloadDisc(game);
    if (this.stopped) return;

    this.status.set('Démarrage…');
    core.setCpuEngine('cached');
    core.loadBios(await toBytes(biosBlob));
    core.loadDisc({ bin: await toBytes(discBlob), cue: game.disc.cue });
    if (this.stopped) return;

    await this.restoreSaves(core);
    if (this.stopped) return;

    this.status.set('');
    this.running.set(true);
    // The card is sent to the server a few seconds after the game writes it.
    this.cardTimer = window.setInterval(() => this.flushMemcard(), 5000);
    this.run(core);
  }

  /** Brings back my memory card, then my quick save. A refusal is reported, not fatal. */
  private async restoreSaves(core: Ps1Core): Promise<void> {
    this.status.set('Chargement des sauvegardes…');
    try {
      const card = await firstValueFrom(this.saves.load(this.id, 'memcard'));
      if (card) core.loadMemcard(0, card);
    } catch (error) {
      console.error('[GamePlay] Carte mémoire illisible', error);
      this.say('Carte mémoire non chargée : la partie démarre avec une carte vide.');
    }
    try {
      const state = await firstValueFrom(this.saves.load(this.id, 'state'));
      if (state) {
        core.loadState(state);
        this.say('Sauvegarde rapide chargée.');
      }
    } catch (error) {
      console.error('[GamePlay] Sauvegarde rapide refusée', error);
      this.say(this.stateMessage(error, 'chargée'));
    }
  }

  private downloadDisc(game: Game): Promise<Blob> {
    this.status.set(`Téléchargement de « ${game.title} »…`);
    return new Promise<Blob>((resolve, reject) => {
      this.download = this.games
        .disc(game.id)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.DownloadProgress) {
              const total = event.total ?? game.disc?.size;
              this.progress.set(total ? Math.round((event.loaded / total) * 100) : undefined);
            } else if (event.type === HttpEventType.Response) {
              resolve(event.body as Blob);
            }
          },
          error: reject,
        });
    });
  }

  /** Frame loop on requestAnimationFrame, paced at the console's own rate (60 Hz NTSC, 50 Hz PAL). */
  private run(core: Ps1Core): void {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NO_CANVAS');
    const audio = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
    this.audio = audio;
    void audio.resume();
    let last = performance.now();
    let owed = 0;

    const tick = (now: number) => {
      this.frameHandle = requestAnimationFrame(tick);
      if (this.paused()) {
        last = now;
        return;
      }
      const step = 1000 / (core.isPal ? 50 : 60);
      owed = Math.min(owed + now - last, step * 3);
      last = now;
      try {
        while (owed >= step) {
          owed -= step;
          core.runFrame();
          const { rgba, width, height } = core.frame();
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          // rgba is a view into wasm memory: copy it before the next runFrame.
          ctx.putImageData(new ImageData(rgba.slice(), width, height), 0, 0);
          this.nextAudio = this.queueAudio(audio, core.readAudio(), this.nextAudio);
        }
      } catch (error) {
        console.error('[GamePlay] Erreur pendant la partie', error);
        this.stop();
        this.running.set(false);
        this.error.set(this.messageOf(error));
      }
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  /** Sends the memory card to the server if the game has written it since the last call. */
  private flushMemcard(): void {
    const core = this.core;
    if (!core) return;
    try {
      this.pendingCard = core.takeMemcard(0) ?? this.pendingCard;
    } catch (error) {
      console.error('[GamePlay] Carte mémoire illisible', error);
      return;
    }
    const card = this.pendingCard;
    if (!card) return;
    this.saves.save(this.id, 'memcard', card).subscribe({
      next: () => {
        if (this.pendingCard === card) this.pendingCard = undefined;
      },
      // Kept in pendingCard: the next tick tries again.
      error: (error) => console.error('[GamePlay] Carte mémoire non envoyée', error),
    });
  }

  saveState(event?: Event): void {
    this.blur(event);
    const core = this.core;
    if (!core || !this.running()) return;
    try {
      const state = core.saveState();
      this.saves.save(this.id, 'state', state).subscribe({
        next: () => this.say('Sauvegarde rapide enregistrée.'),
        error: (error) => {
          console.error('[GamePlay] Sauvegarde rapide non envoyée', error);
          this.say("La sauvegarde n'a pas pu être envoyée au serveur. Réessayez.");
        },
      });
    } catch (error) {
      console.error('[GamePlay] Sauvegarde rapide impossible', error);
      this.say(this.stateMessage(error, 'enregistrée'));
    }
  }

  loadState(event?: Event): void {
    this.blur(event);
    const core = this.core;
    if (!core || !this.running()) return;
    this.saves.load(this.id, 'state').subscribe({
      next: (state) => {
        if (!state) return this.say("Aucune sauvegarde rapide pour ce jeu : appuyez d'abord sur K.");
        try {
          // All or nothing: a refused state leaves the running game untouched.
          core.loadState(state);
          this.nextAudio = 0;
          this.say('Sauvegarde rapide chargée.');
        } catch (error) {
          console.error('[GamePlay] Sauvegarde rapide refusée', error);
          this.say(this.stateMessage(error, 'chargée'));
        }
      },
      error: (error) => {
        console.error('[GamePlay] Sauvegarde rapide introuvable', error);
        this.say('Impossible de récupérer la sauvegarde. Vérifiez votre connexion.');
      },
    });
  }

  private say(message: string): void {
    this.notice.set(message);
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.notice.set(''), 6000);
  }

  private stateMessage(error: unknown, verb: string): string {
    if (error instanceof Ps1Error) {
      const reasons: Partial<Record<Ps1ErrorCode, string>> = {
        STATE_DISC: 'elle vient d’un autre disque',
        STATE_BIOS: 'elle vient d’un autre BIOS',
        STATE_VERSION: 'elle vient d’une autre version de l’émulateur',
        STATE_BAD_MAGIC: 'le fichier n’est pas une sauvegarde',
        STATE_CORRUPT: 'le fichier est abîmé',
        STATE_NO_SPACE: 'la mémoire manque',
      };
      return `Sauvegarde rapide non ${verb} : ${reasons[error.code] ?? error.code}. La partie continue.`;
    }
    return `Sauvegarde rapide non ${verb}. La partie continue.`;
  }

  togglePause(event?: Event): void {
    this.blur(event);
    if (!this.running()) return;
    const paused = !this.paused();
    this.paused.set(paused);
    if (paused) void this.audio?.suspend();
    else void this.audio?.resume();
  }

  reset(event?: Event): void {
    this.blur(event);
    this.core?.reset();
    this.nextAudio = 0;
  }

  fullscreen(event?: Event): void {
    this.blur(event);
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.stage().nativeElement.requestFullscreen?.();
  }

  toggleHelp(event?: Event): void {
    this.blur(event);
    if (!this.running()) return;
    if (this.dialog.openDialogs.length) {
      this.dialog.closeAll();
      return;
    }
    // The game waits behind the dialog, and the keys typed there must not reach the pad.
    const wasPaused = this.paused();
    if (!wasPaused) this.togglePause();
    this.releaseAll();
    this.dialog
      .open(PadHelpDialogComponent, { autoFocus: 'dialog' })
      .afterClosed()
      .subscribe(() => {
        if (!wasPaused && !this.stopped) this.togglePause();
      });
  }

  /** A clicked button keeps focus: Enter (Start) would click it again. */
  private blur(event?: Event): void {
    (event?.currentTarget as HTMLElement | null)?.blur();
  }

  /** Schedules interleaved stereo float32 right after the previous chunk; returns the new end time. */
  private queueAudio(audio: AudioContext, samples: Float32Array, nextTime: number): number {
    const length = samples.length >> 1;
    if (!length) return nextTime;
    const buffer = audio.createBuffer(2, length, AUDIO_SAMPLE_RATE);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      left[i] = samples[2 * i];
      right[i] = samples[2 * i + 1];
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    // Fell behind (tab in background, slow frame): restart slightly ahead.
    const start = Math.max(nextTime, audio.currentTime + 0.02);
    source.start(start);
    return start + buffer.duration;
  }

  /** Stops the loop and the sound, and drops the machine so its memory can be freed. */
  private stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frameHandle);
    window.clearInterval(this.cardTimer);
    window.clearTimeout(this.noticeTimer);
    this.download?.unsubscribe();
    void this.audio?.close();
    this.audio = undefined;
    this.core = undefined;
  }

  private messageOf(error: unknown): string {
    if (error instanceof Ps1Error) return MESSAGES[error.code] ?? `Erreur de l'émulateur (${error.code}).`;
    if (error instanceof WebAssembly.RuntimeError) return MESSAGES.CRASHED!;
    const message = error instanceof Error ? error.message : '';
    if (message === 'NO_BIOS') return "Aucun BIOS dans votre bibliothèque : ajoutez-en un pour pouvoir jouer.";
    if (message === 'NO_DISC') return "Ce jeu n'a pas de fichier à lancer.";
    return 'Impossible de lancer ce jeu. Vérifiez votre connexion et réessayez.';
  }
}
