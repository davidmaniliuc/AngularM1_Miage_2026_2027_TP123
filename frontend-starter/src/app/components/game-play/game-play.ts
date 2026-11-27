import { HttpEventType } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AUDIO_SAMPLE_RATE, Ps1Core, Ps1Error, Ps1ErrorCode, toBytes } from '@davidmaniliuc/substation';
import { firstValueFrom, Subscription } from 'rxjs';
import { Game } from '../../shared/models/game.model';
import { BiosService } from '../../shared/services/bios.service';
import { EmulatorService } from '../../shared/services/emulator.service';
import { GameService } from '../../shared/services/game.service';
import { SaveService } from '../../shared/services/save.service';
import { formatSize } from '../../shared/utils/audio-file';
import { isPadKey, padMask, PAD_IDLE } from '../../shared/utils/pad';
import { sampleFrameColor } from './frame-color';
import { PadHelpDialogComponent } from './pad-help-dialog';
import { Ps1Scene3dComponent, type CameraPreset } from './ps1-scene-3d';

type BootStep = 'console' | 'disc' | 'boot' | 'saves' | 'scene';
type NoticeTone = 'info' | 'ok' | 'warn' | 'error';

const BOOT_STEPS: readonly { key: BootStep; label: string }[] = [
  { key: 'console', label: 'Console' },
  { key: 'disc', label: 'Disque' },
  { key: 'boot', label: 'Démarrage' },
  { key: 'saves', label: 'Sauvegardes' },
  { key: 'scene', label: 'Salon 3D' },
];

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

/** Page /games/:id/play: downloads the disc and the BIOS, then runs the emulator in a 3D CRT/PS1 setup (or 2D fallback). */
@Component({
  selector: 'app-game-play',
  imports: [RouterLink, MatButtonModule, MatIconModule, Ps1Scene3dComponent],
  template: `
    <header class="play-bar" [class.play-bar-3d]="viewMode() === '3d'">
      <a [routerLink]="['/games', id]" class="back"><mat-icon>arrow_back</mat-icon>Quitter la partie</a>
      @if (title()) {
        <span class="sep" aria-hidden="true"></span>
        <div class="game-id">
          <h1>{{ title() }}</h1>
          @if (metaLine()) {
            <span class="meta mono">{{ metaLine() }}</span>
          }
        </div>
      }

      @if (running() && !error()) {
        <div class="live-state mono" aria-live="polite">
          @if (paused()) {
            <span class="state-chip state-paused"><i aria-hidden="true"></i>En pause</span>
          } @else if (memcardSynced()) {
            <span class="state-chip state-ok"><i aria-hidden="true"></i>Carte mémoire sauvée</span>
          } @else {
            <span class="state-chip state-live"><i aria-hidden="true"></i>{{ videoStandard() }}</span>
          }
        </div>
      }
    </header>

    @if (error()) {
      <section class="error-card" role="alert" data-testid="error">
        <div class="error-body">
          <div class="error-head">
            <mat-icon class="icon-fill">error</mat-icon>
            <h2>{{ errorTitle() }}</h2>
          </div>
          <p>{{ error() }}</p>
          <div class="error-actions">
            @if (missingBios()) {
              <a mat-flat-button routerLink="/games/bios">Gérer mes BIOS</a>
            } @else if (!missingDisc()) {
              <button mat-flat-button type="button" (click)="retry()">Réessayer</button>
            }
            <a mat-stroked-button [routerLink]="['/games', id]">Retour à la fiche</a>
          </div>
        </div>
      </section>
    }

    <div
      #consoleHost
      class="console"
      [class.console-3d]="viewMode() === '3d'"
      [class.is-fullscreen]="isFullscreen()"
      [hidden]="!!error()"
    >
      <div
        #stage
        class="stage"
        [class.stage-3d]="viewMode() === '3d'"
        [class.stage-booting]="booting()"
        [class.stage-paused]="paused() && !helpOpen()"
      >
        <canvas
          #screen
          class="screen"
          [class.offscreen]="viewMode() === '3d'"
          aria-label="Écran du jeu"
          data-testid="screen"
        ></canvas>
        @if (viewMode() === '3d') {
          @defer (when running() && viewMode() === '3d') {
            <app-ps1-scene-3d
              [sourceCanvas]="canvas().nativeElement"
              [frameTick]="frameTick()"
              [screenGlow]="screenGlow()"
              [pressedMask]="pressedMask()"
              [paused]="paused()"
              [cameraPreset]="cameraPreset()"
              [crtEffect]="crtEffect()"
              (ready)="sceneReady.set(true)"
              (webglFailed)="onWebglFailed()"
            />
          } @placeholder {
            <div class="scene-placeholder" aria-hidden="true"></div>
          } @loading (minimum 150ms) {
            <div class="scene-placeholder" aria-hidden="true"></div>
          }
        }

        <!-- Séquence de démarrage : une seule attente, du téléchargement à la scène 3D. -->
        @if (booting()) {
          <div class="boot" role="status" aria-live="polite">
            <div class="boot-deck">
              <div class="spindle" aria-hidden="true">
                <span class="boot-disc"></span>
              </div>

              @if (title()) {
                <p class="boot-title">{{ title() }}</p>
              }
              @if (bootMeta()) {
                <p class="boot-meta mono">{{ bootMeta() }}</p>
              }

              <ol class="boot-steps" aria-hidden="true">
                @for (item of steps(); track item.key; let i = $index) {
                  <li [attr.data-state]="i < stepIndex() ? 'done' : i === stepIndex() ? 'current' : 'todo'">
                    <span class="step-dot"></span>
                    <span class="step-label">{{ item.label }}</span>
                  </li>
                }
              </ol>

              <div class="boot-meter">
                <span
                  class="boot-bar"
                  [class.indeterminate]="step() !== 'disc' || progress() === undefined"
                  aria-hidden="true"
                >
                  <span [style.transform]="'scaleX(' + bootProgress() + ')'"></span>
                </span>
                <div class="boot-readout">
                  <p class="boot-status" data-testid="status">{{ status() || 'Installation du salon 3D…' }}</p>
                  <span class="pct mono">{{ bootTelemetry() }}</span>
                </div>
              </div>

              @if (step() === 'scene' && !webglUnavailable()) {
                <button type="button" class="boot-fallback" (click)="switchTo2dNow($event)">
                  Passer directement en écran 2D
                </button>
              }
            </div>
          </div>
        }

        @if (paused() && !helpOpen()) {
          <div class="pause-overlay" data-testid="paused" aria-live="polite">
            <div class="pause-card" role="region" aria-label="Partie en pause">
              <span class="pause-strip" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              <div class="pause-body">
                <div class="pause-head">
                  <h2>Partie en pause</h2>
                  @if (title()) {
                    <p class="pause-sub">
                      <span>{{ title() }}</span>
                      @if (game()?.serial) {
                        <span class="pause-serial mono"> · {{ game()?.serial }}</span>
                      }
                    </p>
                  }
                </div>

                <button type="button" class="pause-primary" (click)="togglePause($event)">
                  <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 8.5l13 7.5-13 7.5z" /></svg>
                  <span>Reprendre la partie</span>
                  <kbd>P</kbd>
                </button>

                <div class="pause-grid">
                  <button type="button" class="pause-btn" (click)="saveState($event)">
                    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 5h17l4 4v18H6z" /><path d="M11 5v7h9V5M10 27v-8h12v8" /></svg>
                    <span>Sauvegarder</span>
                    <kbd>K</kbd>
                  </button>
                  <button type="button" class="pause-btn" (click)="loadState($event)">
                    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v15M9.5 14l6.5 6.5 6.5-6.5M6 25h20" /></svg>
                    <span>Charger</span>
                    <kbd>L</kbd>
                  </button>
                  <button type="button" class="pause-btn" (click)="toggleHelp($event)">
                    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 11h14a5 5 0 0 1 5 5v2a4 4 0 0 1-7 2.5l-1.5-2h-7L10 20.5A4 4 0 0 1 3 18v-2a5 5 0 0 1 5-5z" /><path d="M10 14v4M8 16h4M22 14.5v0M24 17v0" /></svg>
                    <span>Touches</span>
                    <kbd>H</kbd>
                  </button>
                  <button
                    type="button"
                    class="pause-btn"
                    [class.armed]="confirmingReset()"
                    (click)="requestReset($event)"
                  >
                    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M24.5 11A9.5 9.5 0 1 0 25.5 18" /><path d="M25 5v6.5h-6.5" /></svg>
                    <span>{{ confirmingReset() ? 'Confirmer ?' : 'Redémarrer' }}</span>
                  </button>
                </div>

                <a [routerLink]="['/games', id]" class="pause-exit">
                  <mat-icon>arrow_back</mat-icon>Quitter vers la fiche du jeu
                </a>
              </div>
            </div>
          </div>
        }
      </div>

      @if (!error()) {
        <div
          class="tray"
          [class.tray-dimmed]="booting() || (paused() && !helpOpen())"
          [attr.inert]="booting() || (paused() && !helpOpen()) ? '' : null"
          role="toolbar"
          aria-label="Commandes de la partie"
        >
          <div class="group" role="group" aria-label="Partie">
            <button
              type="button"
              class="ctl ctl-pause"
              data-testid="pause"
              [attr.aria-pressed]="paused()"
              (click)="togglePause($event)"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                @if (paused()) { <path d="M11 8.5l13 7.5-13 7.5z" /> } @else { <path d="M11 8v16M21 8v16" /> }
              </svg>
              <span class="lbl">{{ paused() ? 'Reprendre' : 'Pause' }}</span>
              <kbd>P</kbd>
            </button>

            <button
              type="button"
              class="ctl"
              [class.armed]="confirmingReset()"
              data-testid="reset"
              [attr.aria-label]="confirmingReset() ? 'Confirmer le redémarrage de la console' : 'Redémarrer la console'"
              (click)="requestReset($event)"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M24.5 11A9.5 9.5 0 1 0 25.5 18" /><path d="M25 5v6.5h-6.5" /></svg>
              <span class="lbl">{{ confirmingReset() ? 'Confirmer ?' : 'Reset' }}</span>
            </button>

            <button
              type="button"
              class="ctl ctl-toggle"
              data-testid="mute"
              [attr.aria-pressed]="muted()"
              [attr.aria-label]="muted() ? 'Réactiver le son du jeu' : 'Couper le son du jeu'"
              (click)="toggleMute($event)"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M6 12h5l7-5v18l-7-5H6z" />
                @if (muted()) {
                  <path d="M22 12l6 8M28 12l-6 8" />
                } @else {
                  <path d="M22 12a6 6 0 0 1 0 8M25 9a10 10 0 0 1 0 14" />
                }
              </svg>
              <span class="lbl">{{ muted() ? 'Muet' : 'Son' }}</span>
              <kbd>U</kbd>
            </button>
          </div>

          <div class="group" role="group" aria-label="Affichage">
            @if (!webglUnavailable()) {
              <div class="mode-switch" role="group" aria-label="Mode d'affichage">
                <button
                  type="button"
                  class="mode-opt"
                  data-testid="view-mode"
                  [attr.aria-pressed]="viewMode() === '3d'"
                  (click)="setViewMode('3d', $event)"
                >3D</button>
                <button
                  type="button"
                  class="mode-opt"
                  data-testid="view-mode-2d"
                  [attr.aria-pressed]="viewMode() === '2d'"
                  (click)="setViewMode('2d', $event)"
                >2D</button>
              </div>
            }

            @if (viewMode() === '3d') {
              <button
                type="button"
                class="ctl ctl-toggle"
                data-testid="camera-zoom"
                [attr.aria-pressed]="cameraPreset() === 'screen'"
                (click)="toggleCameraPreset($event)"
              >
                <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14.5" cy="14.5" r="7.5" /><path d="M20.2 20.2L26 26" /></svg>
                <span class="lbl">Zoom télé</span>
                <kbd>V</kbd>
              </button>

              <button
                type="button"
                class="ctl ctl-toggle"
                data-testid="crt-toggle"
                [attr.aria-pressed]="crtEffect()"
                (click)="toggleCrt($event)"
              >
                <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="7" width="22" height="16" rx="2" /><path d="M9 12h14M9 16h14M11 26h10" /></svg>
                <span class="lbl">CRT</span>
              </button>
            }
          </div>

          <div class="group" role="group" aria-label="Sauvegarde rapide">
            <button
              type="button"
              class="ctl"
              [class.flash-ok]="saveFlash() === 'saved'"
              data-testid="save-state"
              (click)="saveState($event)"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                @if (saveFlash() === 'saved') {
                  <path d="M7 16.5l6 6L25 10" />
                } @else {
                  <path d="M6 5h17l4 4v18H6z" /><path d="M11 5v7h9V5M10 27v-8h12v8" />
                }
              </svg>
              <span class="lbl">{{ saveFlash() === 'saved' ? 'Enregistré' : 'Sauver' }}</span>
              <kbd>K</kbd>
            </button>

            <button
              type="button"
              class="ctl"
              [class.flash-ok]="saveFlash() === 'loaded'"
              data-testid="load-state"
              (click)="loadState($event)"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                @if (saveFlash() === 'loaded') {
                  <path d="M7 16.5l6 6L25 10" />
                } @else {
                  <path d="M16 5v15M9.5 14l6.5 6.5 6.5-6.5M6 25h20" />
                }
              </svg>
              <span class="lbl">{{ saveFlash() === 'loaded' ? 'Chargé' : 'Charger' }}</span>
              <kbd>L</kbd>
            </button>
          </div>

          <div class="group end" role="group" aria-label="Aide et écran">
            <button type="button" class="ctl" data-testid="help" (click)="toggleHelp($event)">
              <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 11h14a5 5 0 0 1 5 5v2a4 4 0 0 1-7 2.5l-1.5-2h-7L10 20.5A4 4 0 0 1 3 18v-2a5 5 0 0 1 5-5z" /><path d="M10 14v4M8 16h4M22 14.5v0M24 17v0" /></svg>
              <span class="lbl">Touches</span>
              <kbd>H</kbd>
            </button>

            <button
              type="button"
              class="ctl ctl-toggle"
              data-testid="fullscreen"
              [attr.aria-pressed]="isFullscreen()"
              [attr.aria-label]="isFullscreen() ? 'Quitter le plein écran' : 'Passer en plein écran'"
              (click)="fullscreen($event)"
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                @if (isFullscreen()) {
                  <path d="M12 5v7H5M20 5v7h7M27 20h-7v7M5 20h7v7" />
                } @else {
                  <path d="M5 12V5h7M20 5h7v7M27 20v7h-7M12 27H5v-7" />
                }
              </svg>
              <span class="lbl">{{ isFullscreen() ? 'Quitter' : 'Plein écran' }}</span>
            </button>
          </div>
        </div>
      }
    </div>

    <div class="notice-slot" [class.notice-slot-3d]="viewMode() === '3d'">
      <p class="notice" [class.visible]="!!notice()" [attr.data-tone]="noticeTone()" role="status" data-testid="notice">
        @if (notice()) {
          <i class="notice-dot" aria-hidden="true"></i>
        }
        <span>{{ notice() }}</span>
      </p>
    </div>
  `,
  styles: `
    :host { display: block; }

    /* Barre supérieure compacte : retour, identité du jeu et état matériel. */
    .play-bar {
      display: flex;
      align-items: center;
      gap: 14px;
      width: min(100%, 960px, calc((100dvh - var(--gpc-play-chrome, 174px)) * 1.3333));
      min-height: 36px;
      margin-bottom: 10px;
    }
    .play-bar.play-bar-3d {
      width: min(100%, 1080px, calc((100dvh - var(--gpc-play-chrome, 174px)) * 1.6));
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 10px 0 6px;
      margin-left: -6px;
      border-radius: 3px;
      color: var(--gpc-ink-soft);
      font-size: 13.5px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      flex: none;
      transition: color 140ms, background-color 140ms;
    }
    .back:hover { color: var(--gpc-ink); background: color-mix(in srgb, var(--gpc-inlay) 80%, transparent); }
    .back mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .sep { width: 1px; height: 20px; background: var(--gpc-edge); flex: none; }
    .game-id { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; min-width: 0; flex: 1; }
    .game-id h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.015em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .meta { font-size: 11.5px; color: var(--gpc-ink-soft); letter-spacing: 0.04em; white-space: nowrap; }

    .live-state { flex: none; margin-left: auto; }
    .state-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 26px;
      padding: 0 10px;
      border: 1px solid var(--gpc-edge);
      border-radius: 2px;
      background: var(--gpc-inlay);
      color: var(--gpc-ink-soft);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .state-chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--gpc-ink-soft); }
    .state-live i { background: var(--gpc-compat-ok); }
    .state-ok { color: var(--gpc-compat-ok); border-color: color-mix(in srgb, var(--gpc-compat-ok) 45%, var(--gpc-edge)); }
    .state-ok i { background: var(--gpc-compat-ok); }
    .state-paused { color: var(--gpc-compat-issues); border-color: color-mix(in srgb, var(--gpc-compat-issues) 45%, var(--gpc-edge)); }
    .state-paused i { background: var(--gpc-compat-issues); }

    /* Carte d'erreur : même vocabulaire de dos noir que les formulaires. */
    .error-card {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      max-width: 560px;
      margin-top: 20px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 45%, var(--gpc-edge));
      border-radius: 3px;
      background: var(--gpc-inlay);
      box-shadow: 0 18px 40px -24px #0007;
      overflow: hidden;
    }
    .error-card::before {
      content: '';
      background:
        linear-gradient(var(--mat-sys-error), var(--mat-sys-error)) 50% 24px / 4px 28px no-repeat,
        var(--gpc-spine);
    }
    .error-body { display: grid; gap: 12px; padding: 24px 26px; }
    .error-head { display: flex; align-items: center; gap: 10px; }
    .error-head mat-icon { color: var(--mat-sys-error); font-size: 22px; width: 22px; height: 22px; }
    .error-head h2 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.015em; }
    .error-body p { margin: 0; max-width: 52ch; color: var(--gpc-ink-soft); font-size: 14px; line-height: 1.5; }
    .error-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }

    /* Console : scène 16:10 (3D) ou 4:3 (2D) + tiroir matériel soudé en dessous. */
    .console {
      container-type: inline-size;
      width: min(100%, 960px, calc((100dvh - var(--gpc-play-chrome, 174px)) * 1.3333));
      border: 1px solid light-dark(var(--gpc-spine), #282a31);
      border-radius: 3px;
      background: var(--gpc-spine);
      box-shadow: 0 24px 44px -24px #000c;
      overflow: hidden;
    }
    .console.console-3d {
      width: min(100%, 1080px, calc((100dvh - var(--gpc-play-chrome, 174px)) * 1.6));
    }
    .console:fullscreen {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
      max-width: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .console:fullscreen .stage {
      flex: 1;
      min-height: 0;
      aspect-ratio: auto;
      display: grid;
      place-items: center;
    }
    .console:fullscreen .stage.stage-3d app-ps1-scene-3d { width: 100%; height: 100%; }
    .console:fullscreen .screen:not(.offscreen) {
      width: auto;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
    }

    .stage {
      position: relative;
      width: 100%;
      background: var(--gpc-spine);
      overflow: hidden;
    }
    .stage.stage-3d { aspect-ratio: 16 / 10; }
    .scene-placeholder { width: 100%; height: 100%; }
    .screen { display: block; width: 100%; aspect-ratio: 4 / 3; background: #000; image-rendering: pixelated; }
    .screen.offscreen { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

    /* Séquence de démarrage : disque noir dans son logement, étapes reliées et débit réel. */
    .boot {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(ellipse at 50% 38%, #1a1b20 0%, var(--gpc-spine) 66%);
      color: var(--gpc-spine-ink);
    }
    .boot-deck {
      display: grid;
      justify-items: center;
      gap: 14px;
      width: min(460px, 100%);
      text-align: center;
    }
    .spindle {
      display: grid;
      place-items: center;
      width: 108px;
      height: 108px;
      border-radius: 50%;
      border: 1px solid #26272d;
      background: radial-gradient(circle, #141518 0 65%, #09090a 100%);
      box-shadow: inset 0 6px 14px #000a;
    }
    .boot-disc {
      width: 92px;
      aspect-ratio: 1;
      border-radius: 50%;
      background:
        radial-gradient(circle, #191a1e 0 10%, #44464e 10.5% 12.5%, #0b0b0c 13% 31%, #26272c 31.5% 32.5%, transparent 33%),
        conic-gradient(from 200deg, #0b0b0c, #3f2257 8%, #0b0b0c 16%, #14435e 26%, #0b0b0c 34%, #524014 44%, #0b0b0c 52%, #144a33 62%, #0b0b0c 70%, #571d32 82%, #0b0b0c);
      box-shadow: 0 0 0 1px #32343b, 0 12px 24px -12px #000;
      animation: boot-spin 2.4s linear infinite;
    }
    .boot-title { margin: 2px 0 0; max-width: 34ch; font-size: 19px; font-weight: 800; letter-spacing: -0.015em; text-wrap: balance; color: #f6f7f9; }
    .boot-meta { margin: -8px 0 0; font-size: 11.5px; color: #a6a9b1; letter-spacing: 0.06em; }

    .boot-steps {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px 16px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      font: 500 10.5px/1 var(--gpc-mono);
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .boot-steps li { display: inline-flex; align-items: center; gap: 6px; color: #8e9199; }
    .step-dot { width: 7px; height: 7px; border: 1.5px solid currentColor; border-radius: 50%; flex: none; }
    .boot-steps li[data-state='done'] { color: #cfd2d9; }
    .boot-steps li[data-state='done'] .step-dot { background: #cfd2d9; border-color: #cfd2d9; }
    .boot-steps li[data-state='current'] { color: #f6f7f9; font-weight: 600; }
    .boot-steps li[data-state='current'] .step-dot { border-color: var(--gpc-ps-cross); background: var(--gpc-ps-cross); }

    .boot-meter { display: grid; gap: 8px; width: min(420px, 100%); margin-top: 2px; }
    .boot-bar {
      position: relative;
      display: block;
      width: 100%;
      height: 3px;
      border-radius: 2px;
      background: #26272d;
      overflow: hidden;
    }
    .boot-bar span {
      display: block;
      height: 100%;
      background: #f6f7f9;
      transform-origin: left;
      transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .boot-bar.indeterminate::after {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 32%;
      background: linear-gradient(90deg, transparent, var(--gpc-ps-cross), transparent);
      animation: boot-sweep 1.4s ease-in-out infinite;
    }
    .boot-readout { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .boot-status { margin: 0; color: #b7bac2; font-size: 13px; text-align: left; }
    .pct { color: #ececee; font-size: 12px; font-weight: 500; white-space: nowrap; }

    .boot-fallback {
      margin-top: 4px;
      height: 34px;
      padding: 0 14px;
      border: 1px solid #3a3c44;
      border-radius: 3px;
      background: transparent;
      color: var(--gpc-spine-ink);
      font: 600 12.5px/1 Archivo, system-ui, sans-serif;
      cursor: pointer;
      transition: background-color 140ms, border-color 140ms;
    }
    .boot-fallback:hover { background: var(--gpc-spine-raised); border-color: #6a6d76; }

    @keyframes boot-spin { to { transform: rotate(360deg); } }
    @keyframes boot-sweep {
      from { transform: translateX(-120%); }
      to { transform: translateX(420%); }
    }

    /* Superposition de pause : vraie fiche d'actions dans le style Le Boîtier. */
    .pause-overlay {
      position: absolute;
      inset: 0;
      z-index: 3;
      display: flex;
      align-items: safe center;
      justify-content: center;
      padding: 20px;
      overflow-y: auto;
      background: #0b0b0cb8;
      backdrop-filter: blur(4px);
    }
    .pause-card {
      width: 100%;
      max-width: 360px;
      min-width: 0;
      border: 1px solid #303238;
      border-radius: 3px;
      background: var(--gpc-spine);
      color: var(--gpc-spine-ink);
      box-shadow: 0 24px 48px -16px #000d;
      overflow: hidden;
    }
    .pause-strip { display: flex; height: 3px; }
    .pause-strip i { flex: 1; }
    .pause-strip i:nth-child(1) { background: var(--gpc-ps-triangle); }
    .pause-strip i:nth-child(2) { background: var(--gpc-ps-circle); }
    .pause-strip i:nth-child(3) { background: var(--gpc-ps-cross); }
    .pause-strip i:nth-child(4) { background: var(--gpc-ps-square); }

    .pause-body { display: grid; gap: 14px; padding: 20px; }
    .pause-head h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #f6f7f9; }
    .pause-sub { margin: 4px 0 0; font-size: 13px; color: #b7bac2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pause-serial { font-size: 11.5px; color: #8e9199; }

    .pause-primary {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      height: 44px;
      padding: 0 14px;
      border: 0;
      border-radius: 3px;
      background: var(--gpc-spine-active);
      color: var(--gpc-spine-active-ink);
      font: 700 14px/1 Archivo, system-ui, sans-serif;
      cursor: pointer;
      transition: background-color 140ms;
    }
    .pause-primary:hover { background: #ffffff; }
    .pause-primary svg { width: 18px; height: 18px; fill: currentColor; stroke: none; flex: none; }
    .pause-primary kbd {
      margin-left: auto;
      padding: 3px 6px;
      border: 1px solid #a9adb5;
      border-radius: 2px;
      color: #4f525a;
      font: 600 10px/1 var(--gpc-mono);
    }

    .pause-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .pause-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      height: 40px;
      padding: 0 10px;
      border: 1px solid #2d2f36;
      border-radius: 3px;
      background: #15161a;
      color: var(--gpc-spine-ink);
      font: 600 13px/1 Archivo, system-ui, sans-serif;
      cursor: pointer;
      transition: background-color 140ms, border-color 140ms;
    }
    .pause-btn:hover { background: #1f2026; border-color: #454750; }
    .pause-btn.armed { border-color: #ff8a80; color: #ffdad6; background: #4a1a17; }
    .pause-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
    .pause-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pause-btn kbd {
      margin-left: auto;
      padding: 2px 5px;
      border: 1px solid #3a3c44;
      border-radius: 2px;
      color: #9ea1aa;
      font: 500 10px/1 var(--gpc-mono);
    }

    .pause-exit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 36px;
      border-top: 1px solid #222328;
      padding-top: 10px;
      color: #9ea1aa;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    .pause-exit:hover { color: #f6f7f9; }
    .pause-exit mat-icon { font-size: 16px; width: 16px; height: 16px; }

    /* Tiroir matériel de commandes : noir comme le dos et le lecteur audio. */
    .tray {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 0;
      padding: 6px 8px;
      background: var(--gpc-spine);
      border-top: 1px solid #222329;
      transition: opacity 180ms ease;
    }
    .tray.tray-dimmed { opacity: 0.28; pointer-events: none; }
    .group { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 0 5px; }
    .group:first-child { padding-left: 0; }
    .group:last-child { padding-right: 0; }
    .group + .group { border-left: 1px solid #26272d; }
    .group.end { margin-left: auto; border-left: 0; }

    .ctl {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 38px;
      padding: 0 7px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      color: var(--gpc-spine-ink);
      font: 600 12px/1 Archivo, system-ui, sans-serif;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color 120ms, border-color 120ms, color 120ms;
    }
    .ctl svg { flex: none; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .ctl kbd {
      min-width: 17px;
      padding: 2.5px 4px;
      border: 1px solid #35373f;
      border-radius: 2px;
      color: #9ea1aa;
      font: 500 10px/1 var(--gpc-mono);
      text-align: center;
    }
    .ctl:hover { background: var(--gpc-spine-raised); border-color: #2c2d34; }
    .ctl:active { background: #26272c; }
    .ctl:focus-visible, .mode-opt:focus-visible { outline: 2px solid var(--gpc-ps-cross); outline-offset: 2px; }

    /* Un seul état actif sur le tiroir : jaquette claire tirée du dos (sans couleur de manette). */
    .ctl[aria-pressed='true'] {
      background: var(--gpc-spine-active);
      border-color: var(--gpc-spine-active);
      color: var(--gpc-spine-active-ink);
    }
    .ctl[aria-pressed='true'] kbd { border-color: #a9adb5; color: #4f525a; }
    .tray.tray-dimmed .ctl-pause[aria-pressed='true'] {
      background: var(--gpc-spine-raised);
      border-color: #35373f;
      color: var(--gpc-spine-ink);
    }
    .tray.tray-dimmed .ctl-pause[aria-pressed='true'] kbd { border-color: #35373f; color: #9ea1aa; }

    /* Sélecteur segmenté 3D / 2D sur le tiroir. */
    .mode-switch {
      display: inline-flex;
      height: 38px;
      padding: 2px;
      border: 1px solid #2d2f36;
      border-radius: 3px;
      background: #131417;
      gap: 2px;
    }
    .mode-opt {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      padding: 0 8px;
      border: 0;
      border-radius: 2px;
      background: transparent;
      color: #9ea1aa;
      font: 600 12px/1 var(--gpc-mono);
      letter-spacing: 0.04em;
      cursor: pointer;
      transition: background-color 120ms, color 120ms;
    }
    .mode-opt:hover { color: var(--gpc-spine-ink); }
    .mode-opt[aria-pressed='true'] { background: var(--gpc-spine-active); color: var(--gpc-spine-active-ink); }

    /* Sécurité reset (jetons erreur) et confirmation sauvegarde/chargement. */
    .ctl.armed {
      background: #4a1a17;
      border-color: #ff8a80;
      color: #ffdad6;
    }
    .ctl.flash-ok {
      background: #11241c;
      border-color: #52c79c;
      color: #b5f0d8;
    }
    .ctl.flash-ok kbd { border-color: #52c79c; color: #b5f0d8; }

    /* Emplacement stable pour les retours (zéro saut de mise en page). */
    .notice-slot {
      width: min(100%, 960px, calc((100dvh - var(--gpc-play-chrome, 174px)) * 1.3333));
      min-height: 28px;
      margin-top: 8px;
      display: flex;
      align-items: center;
    }
    .notice-slot.notice-slot-3d {
      width: min(100%, 1080px, calc((100dvh - var(--gpc-play-chrome, 174px)) * 1.6));
    }
    .notice {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      min-height: 28px;
      color: var(--gpc-ink-soft);
      font-size: 13px;
      font-weight: 500;
      opacity: 0;
      transition: opacity 160ms ease;
    }
    .notice.visible { opacity: 1; }
    .notice-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--gpc-ink-soft); }
    .notice[data-tone='ok'] { color: var(--gpc-ink); }
    .notice[data-tone='ok'] .notice-dot { background: var(--gpc-compat-ok); }
    .notice[data-tone='warn'] { color: var(--gpc-compat-issues); }
    .notice[data-tone='warn'] .notice-dot { background: var(--gpc-compat-issues); }
    .notice[data-tone='error'] { color: var(--mat-sys-error); }
    .notice[data-tone='error'] .notice-dot { background: var(--mat-sys-error); }

    /* Moins de place : 3D compacte sous 940px, 2D (moins de boutons) sous 740px. */
    @container (max-width: 940px) {
      .console-3d .tray { justify-content: center; gap: 4px; padding: 6px; }
      .console-3d .group { gap: 2px; padding: 0 5px; }
      .console-3d .group.end { margin-left: 0; border-left: 1px solid #26272d; }
      .console-3d .ctl { flex-direction: column; justify-content: center; gap: 4px; min-width: 64px; height: 50px; padding: 0 6px; font-size: 11px; }
      .console-3d .ctl kbd { display: none; }
      .console-3d .mode-switch { height: 50px; flex-direction: column; }
      .console-3d .mode-opt { flex: 1; padding: 0 8px; font-size: 11px; }
    }
    @container (max-width: 740px) {
      .tray { justify-content: center; gap: 4px; padding: 6px; }
      .group { gap: 2px; padding: 0 5px; }
      .group + .group, .group.end { margin-left: 0; border-left: 0; }
      .ctl { flex-direction: column; justify-content: center; gap: 4px; min-width: 64px; height: 50px; padding: 0 6px; font-size: 11px; }
      .ctl kbd { display: none; }
      .mode-switch { height: 50px; flex-direction: column; }
      .mode-opt { flex: 1; padding: 0 8px; font-size: 11px; }
    }
    @container (max-width: 680px) {
      .boot { padding: 16px; overflow-y: auto; }
      .spindle { width: 84px; height: 84px; }
      .boot-disc { width: 70px; }
      .boot-title { font-size: 16px; }
    }
    /* Mobile : grille 4 colonnes équilibrée (en 3D, Touches et Plein écran occupent 2 colonnes chacun). */
    @container (max-width: 540px) {
      .stage.stage-booting { aspect-ratio: auto; min-height: 268px; }
      .stage.stage-paused { aspect-ratio: auto; min-height: 304px; }
      .boot { padding: 14px; }
      .boot-deck { gap: 10px; }
      .spindle { width: 64px; height: 64px; }
      .boot-disc { width: 52px; }
      .boot-title { font-size: 15px; }
      .boot-meta { margin-top: -4px; font-size: 10.5px; }
      .boot-steps { gap: 6px 12px; font-size: 9.5px; }
      .pause-overlay { padding: 12px; }
      .pause-body { gap: 10px; padding: 14px; }
      .pause-head h2 { font-size: 17px; }
      .pause-primary { height: 40px; font-size: 13.5px; }
      .pause-primary kbd, .pause-btn kbd { display: none; }
      .pause-btn { height: 38px; padding: 0 10px; font-size: 12.5px; }
      .pause-exit { height: 32px; padding-top: 8px; font-size: 12.5px; }
      .tray, .console-3d .tray { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; padding: 6px; }
      .group, .group.end, .console-3d .group, .console-3d .group.end { display: contents; }
      .ctl, .console-3d .ctl {
        width: 100%;
        min-width: 0;
        height: 48px;
        padding: 0 4px;
        font-size: 11px;
      }
      .ctl:not([aria-pressed='true']):not(.armed):not(.flash-ok),
      .console-3d .ctl:not([aria-pressed='true']):not(.armed):not(.flash-ok) {
        border-color: #26272d;
        background: #141518;
      }
      .console-3d .group.end .ctl {
        grid-column: span 2;
        flex-direction: row;
        gap: 7px;
        height: 42px;
        font-size: 12px;
      }
      .mode-switch, .console-3d .mode-switch { width: 100%; height: 48px; }
    }
    @container (max-width: 340px) {
      .pause-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      .play-bar, .play-bar.play-bar-3d,
      .console, .console.console-3d,
      .notice-slot, .notice-slot.notice-slot-3d {
        width: 100%;
      }
      .play-bar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 6px 12px;
      }
      .back { grid-column: 1; grid-row: 1; justify-self: start; }
      .live-state { grid-column: 2; grid-row: 1; justify-self: end; margin-left: 0; }
      .sep { display: none; }
      .game-id { grid-column: 1 / -1; grid-row: 2; }
    }
    @media (prefers-reduced-motion: reduce) {
      .boot-disc, .boot-bar.indeterminate::after { animation: none; }
      .boot-bar span, .ctl, .mode-opt, .back, .notice { transition: none; }
    }
  `,
})
export class GamePlayComponent {
  private readonly games = inject(GameService);
  private readonly dialog = inject(MatDialog);
  private readonly saves = inject(SaveService);
  private readonly biosService = inject(BiosService);
  private readonly emulator = inject(EmulatorService);
  private readonly consoleHost = viewChild.required<ElementRef<HTMLElement>>('consoleHost');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  protected readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('screen');

  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly game = signal<Game | undefined>(undefined);
  readonly status = signal('Préparation de la console…');
  /** 0-100 while the size is known; undefined means indeterminate. */
  readonly progress = signal<number | undefined>(undefined);
  readonly loadedBytes = signal(0);
  readonly totalBytes = signal(0);
  readonly error = signal('');
  readonly missingBios = signal(false);
  readonly missingDisc = signal(false);
  readonly running = signal(false);
  readonly paused = signal(false);
  readonly muted = signal(false);
  readonly isPal = signal(false);
  readonly isFullscreen = signal(false);
  readonly helpOpen = signal(false);
  readonly confirmingReset = signal(false);
  readonly saveFlash = signal<'' | 'saved' | 'loaded'>('');
  readonly memcardSynced = signal(false);
  readonly title = signal('');
  /** Current boot step; 'scene' only exists in 3D. */
  readonly step = signal<BootStep>('console');
  /** The 3D living room finished loading its model. */
  readonly sceneReady = signal(false);
  readonly steps = computed(() => (this.viewMode() === '3d' ? BOOT_STEPS : BOOT_STEPS.filter((item) => item.key !== 'scene')));
  readonly stepIndex = computed(() => this.steps().findIndex((item) => item.key === this.step()));
  /** Whole boot as 0..1: disc download carries the bulk of real wall-clock wait. */
  readonly bootProgress = computed(() => {
    const count = this.steps().length;
    const within = this.step() === 'disc' ? (this.progress() ?? 0) / 100 : 0.2;
    return Math.min(1, Math.max(0.05, (this.stepIndex() + within) / count));
  });
  readonly booting = computed(() => !this.error() && (!this.running() || (this.viewMode() === '3d' && !this.sceneReady())));
  /** Result of the last save or load: it never stops the game. */
  readonly notice = signal('');
  readonly noticeTone = signal<NoticeTone>('info');

  readonly metaLine = computed(() => {
    const g = this.game();
    if (!g) return '';
    return [g.serial, g.region?.toUpperCase(), g.disc?.format?.toUpperCase()].filter(Boolean).join(' · ');
  });

  readonly bootMeta = computed(() => {
    const g = this.game();
    if (!g) return '';
    return [
      g.serial,
      g.region?.toUpperCase(),
      g.disc?.format?.toUpperCase(),
      g.disc?.size ? formatSize(g.disc.size) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  readonly bootTelemetry = computed(() => {
    if (this.step() === 'disc' && this.progress() !== undefined) {
      const total = this.totalBytes();
      const loaded = this.loadedBytes();
      if (total > 0 && loaded > 0) {
        return `${formatSize(Math.min(loaded, total))} / ${formatSize(total)} · ${this.progress()} %`;
      }
      return `${this.progress()} %`;
    }
    const idx = Math.max(0, this.stepIndex());
    return `${idx + 1} / ${this.steps().length}`;
  });

  readonly videoStandard = computed(() => (this.isPal() ? 'PAL · 50 Hz' : 'NTSC · 60 Hz'));

  readonly errorTitle = computed(() => {
    if (this.missingBios()) return 'BIOS PlayStation requis';
    if (this.missingDisc()) return 'Aucun disque attaché';
    return 'Lancement impossible';
  });

  /** 3D console/CRT viewer state. */
  readonly viewMode = signal<'3d' | '2d'>('3d');
  readonly cameraPreset = signal<CameraPreset>('hero');
  readonly crtEffect = signal(true);
  readonly webglUnavailable = signal(false);
  readonly frameTick = signal(0);
  readonly screenGlow = signal<readonly [number, number, number]>([0.16, 0.22, 0.34]);
  readonly pressedMask = signal(PAD_IDLE);

  private core?: Ps1Core;
  private audio?: AudioContext;
  private gain?: GainNode;
  private frameHandle = 0;
  private frameCount = 0;
  private download?: Subscription;
  private stopped = false;
  private cardTimer = 0;
  /** A card the game wrote that the server has not confirmed yet. */
  private pendingCard?: Uint8Array;
  private noticeTimer = 0;
  private resetConfirmTimer = 0;
  private flashTimer = 0;
  private memcardTimer = 0;
  private nextAudio = 0;
  private held = new Set<string>();

  private readonly onFullscreenChange = () => {
    this.isFullscreen.set(Boolean(document.fullscreenElement));
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyP' && !event.repeat) this.togglePause();
    else if (event.code === 'KeyU' && !event.repeat) this.toggleMute();
    else if (event.code === 'KeyV' && !event.repeat && this.viewMode() === '3d') this.toggleCameraPreset();
    else if (event.code === 'KeyH' && !event.repeat) this.toggleHelp();
    else if (event.code === 'KeyK' && !event.repeat) this.saveState();
    else if (event.code === 'KeyL' && !event.repeat) this.loadState();
    else if (isPadKey(event.code) && !this.dialog.openDialogs.length) {
      // Arrows and Enter must not scroll the page or click a focused button.
      event.preventDefault();
      this.held.add(event.code);
      this.syncButtons();
    }
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (this.held.delete(event.code)) this.syncButtons();
  };
  /** A key released while the window had no focus would stay pressed. */
  private readonly releaseAll = () => {
    this.held.clear();
    this.syncButtons();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.releaseAll);
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
      if (document.fullscreenElement) void document.exitFullscreen();
      this.flushMemcard();
      this.stop();
    });
    this.boot();
  }

  retry(): void {
    this.stop();
    this.stopped = false;
    this.error.set('');
    this.missingBios.set(false);
    this.missingDisc.set(false);
    this.running.set(false);
    this.paused.set(false);
    this.sceneReady.set(false);
    this.step.set('console');
    this.progress.set(undefined);
    this.loadedBytes.set(0);
    this.totalBytes.set(0);
    this.status.set('Préparation de la console…');
    this.boot();
  }

  private boot(): void {
    void this.start().catch((error: unknown) => {
      if (this.stopped) return;
      console.error('[GamePlay] Lancement impossible', error);
      this.status.set('');
      this.error.set(this.messageOf(error));
    });
  }

  private syncButtons(): void {
    const mask = padMask(this.held);
    this.pressedMask.set(mask);
    this.core?.setButtons(mask);
  }

  private async start(): Promise<void> {
    const game = await firstValueFrom(this.games.get(this.id));
    this.game.set(game);
    this.title.set(game.title);
    if (!game.disc) {
      this.missingDisc.set(true);
      throw new Error('NO_DISC');
    }
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

    this.step.set('boot');
    this.progress.set(undefined);
    this.status.set('Démarrage de la console…');
    core.setCpuEngine('cached');
    core.loadBios(await toBytes(biosBlob));
    core.loadDisc({ bin: await toBytes(discBlob), cue: game.disc.cue });
    this.isPal.set(Boolean(core.isPal));
    if (this.stopped) return;

    await this.restoreSaves(core);
    if (this.stopped) return;

    this.status.set('');
    this.step.set('scene');
    this.running.set(true);
    // The card is sent to the server a few seconds after the game writes it.
    this.cardTimer = window.setInterval(() => this.flushMemcard(), 5000);
    this.run(core);
  }

  /** Brings back my memory card, then my quick save. A refusal is reported, not fatal. */
  private async restoreSaves(core: Ps1Core): Promise<void> {
    this.step.set('saves');
    this.status.set('Lecture de la carte mémoire…');
    try {
      const card = await firstValueFrom(this.saves.load(this.id, 'memcard'));
      if (card) core.loadMemcard(0, card);
    } catch (error) {
      console.error('[GamePlay] Carte mémoire illisible', error);
      this.say('Carte mémoire non chargée : la partie démarre avec une carte vide.', 'warn');
    }
    try {
      const state = await firstValueFrom(this.saves.load(this.id, 'state'));
      if (state) {
        core.loadState(state);
        this.say('Sauvegarde rapide chargée.', 'ok');
      }
    } catch (error) {
      console.error('[GamePlay] Sauvegarde rapide refusée', error);
      this.say(this.stateMessage(error, 'chargée'), 'warn');
    }
  }

  private downloadDisc(game: Game): Promise<Blob> {
    this.step.set('disc');
    this.status.set('Téléchargement du disque…');
    this.totalBytes.set(game.disc?.size ?? 0);
    this.loadedBytes.set(0);
    return new Promise<Blob>((resolve, reject) => {
      this.download = this.games
        .disc(game.id)
        .subscribe({
          next: (event) => {
            if (event.type === HttpEventType.DownloadProgress) {
              const total = event.total ?? game.disc?.size ?? 0;
              this.loadedBytes.set(event.loaded);
              if (total) this.totalBytes.set(total);
              this.progress.set(total ? Math.round((event.loaded / total) * 100) : undefined);
            } else if (event.type === HttpEventType.Response) {
              this.progress.set(100);
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
    if (typeof audio.createGain === 'function') {
      const gain = audio.createGain();
      gain.gain.value = this.muted() ? 0 : 1;
      gain.connect(audio.destination);
      this.gain = gain;
    } else {
      this.gain = undefined;
    }
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
        let drewFrame = false;
        let lastRgba: Uint8ClampedArray | Uint8Array | undefined;
        let lastWidth = 0;
        let lastHeight = 0;
        while (owed >= step) {
          owed -= step;
          core.runFrame();
          const { rgba, width, height } = core.frame();
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          // rgba is a view into wasm memory: copy it before the next runFrame.
          const copy = rgba.slice();
          ctx.putImageData(new ImageData(copy, width, height), 0, 0);
          lastRgba = copy;
          lastWidth = width;
          lastHeight = height;
          drewFrame = true;
          this.nextAudio = this.queueAudio(audio, core.readAudio(), this.nextAudio);
        }
        if (drewFrame) {
          this.frameCount++;
          this.frameTick.set(this.frameCount);
          if (lastRgba && this.frameCount % 4 === 1) {
            this.screenGlow.set(sampleFrameColor(lastRgba, lastWidth, lastHeight));
          }
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
        this.memcardSynced.set(true);
        window.clearTimeout(this.memcardTimer);
        this.memcardTimer = window.setTimeout(() => this.memcardSynced.set(false), 3500);
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
        next: () => {
          this.flash('saved');
          this.say('Sauvegarde rapide enregistrée.', 'ok');
        },
        error: (error) => {
          console.error('[GamePlay] Sauvegarde rapide non envoyée', error);
          this.say("La sauvegarde n'a pas pu être envoyée au serveur. Réessayez.", 'error');
        },
      });
    } catch (error) {
      console.error('[GamePlay] Sauvegarde rapide impossible', error);
      this.say(this.stateMessage(error, 'enregistrée'), 'warn');
    }
  }

  loadState(event?: Event): void {
    this.blur(event);
    const core = this.core;
    if (!core || !this.running()) return;
    this.saves.load(this.id, 'state').subscribe({
      next: (state) => {
        if (!state) return this.say("Aucune sauvegarde rapide pour ce jeu : appuyez d'abord sur K.", 'info');
        try {
          // All or nothing: a refused state leaves the running game untouched.
          core.loadState(state);
          this.nextAudio = 0;
          this.flash('loaded');
          this.say('Sauvegarde rapide chargée.', 'ok');
        } catch (error) {
          console.error('[GamePlay] Sauvegarde rapide refusée', error);
          this.say(this.stateMessage(error, 'chargée'), 'warn');
        }
      },
      error: (error) => {
        console.error('[GamePlay] Sauvegarde rapide introuvable', error);
        this.say('Impossible de récupérer la sauvegarde. Vérifiez votre connexion.', 'error');
      },
    });
  }

  private flash(kind: 'saved' | 'loaded'): void {
    this.saveFlash.set(kind);
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.saveFlash.set(''), 1600);
  }

  private say(message: string, tone: NoticeTone = 'info'): void {
    this.noticeTone.set(tone);
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
    this.confirmingReset.set(false);
    if (paused) void this.audio?.suspend();
    else void this.audio?.resume();
  }

  toggleMute(event?: Event): void {
    this.blur(event);
    if (!this.running()) return;
    const muted = !this.muted();
    this.muted.set(muted);
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
    this.say(muted ? 'Son de la console coupé.' : 'Son de la console réactivé.', 'info');
  }

  /** Two-click guard on the UI button to prevent losing progress by misclick. */
  requestReset(event?: Event): void {
    this.blur(event);
    if (!this.running()) return;
    if (!this.confirmingReset()) {
      this.confirmingReset.set(true);
      window.clearTimeout(this.resetConfirmTimer);
      this.resetConfirmTimer = window.setTimeout(() => this.confirmingReset.set(false), 3500);
      return;
    }
    this.confirmingReset.set(false);
    window.clearTimeout(this.resetConfirmTimer);
    this.reset();
    if (this.paused()) this.togglePause();
    this.say('Console redémarrée.', 'info');
  }

  reset(event?: Event): void {
    this.blur(event);
    this.core?.reset();
    this.nextAudio = 0;
  }

  toggleCameraPreset(event?: Event): void {
    this.blur(event);
    if (!this.running() || this.viewMode() !== '3d') return;
    this.cameraPreset.update((current) => (current === 'hero' ? 'screen' : 'hero'));
  }

  toggleCrt(event?: Event): void {
    this.blur(event);
    if (!this.running()) return;
    this.crtEffect.update((enabled) => !enabled);
  }

  setViewMode(mode: '3d' | '2d', event?: Event): void {
    this.blur(event);
    if (!this.running() || this.webglUnavailable() || this.viewMode() === mode) return;
    if (mode === '3d') this.sceneReady.set(false);
    this.viewMode.set(mode);
  }

  switchTo2dNow(event?: Event): void {
    this.blur(event);
    this.viewMode.set('2d');
  }

  toggleViewMode(event?: Event): void {
    this.blur(event);
    if (!this.running() || this.webglUnavailable()) return;
    // The scene is rebuilt each time 3D comes back.
    this.sceneReady.set(false);
    this.viewMode.update((mode) => (mode === '3d' ? '2d' : '3d'));
  }

  onWebglFailed(): void {
    this.webglUnavailable.set(true);
    this.viewMode.set('2d');
    this.say('Scène 3D indisponible sur ce navigateur : affichage sur écran 2D.', 'warn');
  }

  fullscreen(event?: Event): void {
    this.blur(event);
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (this.consoleHost().nativeElement.requestFullscreen?.() ?? this.stage().nativeElement.requestFullscreen?.());
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
    this.helpOpen.set(true);
    if (!wasPaused) this.togglePause();
    this.releaseAll();
    this.dialog
      .open(PadHelpDialogComponent, { autoFocus: 'dialog', maxWidth: '94vw' })
      .afterClosed()
      .subscribe(() => {
        this.helpOpen.set(false);
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
    if (!length || (this.muted() && !this.gain)) return nextTime;
    const buffer = audio.createBuffer(2, length, AUDIO_SAMPLE_RATE);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      left[i] = samples[2 * i];
      right[i] = samples[2 * i + 1];
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain ?? audio.destination);
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
    window.clearTimeout(this.resetConfirmTimer);
    window.clearTimeout(this.flashTimer);
    window.clearTimeout(this.memcardTimer);
    this.download?.unsubscribe();
    void this.audio?.close();
    this.audio = undefined;
    this.gain = undefined;
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
