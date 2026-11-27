import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { PAD_BUTTONS, PadButton } from '../../shared/utils/pad';

const byCode = (code: string): PadButton => PAD_BUTTONS.find((item) => item.code === code)!;

/** Visual PlayStation controller mapping and console shortcuts. */
@Component({
  selector: 'app-pad-help-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <div class="dialog-head">
      <h2 mat-dialog-title>Touches du clavier</h2>
      <span class="strip" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </div>

    <div mat-dialog-content data-testid="help-panel" class="panel">
      <section class="section" aria-labelledby="pad-heading">
        <h3 id="pad-heading">Manette PlayStation</h3>

        <div class="pad-schematic">
          <!-- Gâchettes L1/L2 et R1/R2 -->
          <div class="shoulders">
            <div class="shoulder-pair">
              <div class="shoulder">
                <span class="shoulder-tag">{{ l2.label }}</span>
                <kbd>{{ l2.key }}</kbd>
              </div>
              <div class="shoulder">
                <span class="shoulder-tag">{{ l1.label }}</span>
                <kbd>{{ l1.key }}</kbd>
              </div>
            </div>
            <div class="shoulder-pair">
              <div class="shoulder">
                <span class="shoulder-tag">{{ r1.label }}</span>
                <kbd>{{ r1.key }}</kbd>
              </div>
              <div class="shoulder">
                <span class="shoulder-tag">{{ r2.label }}</span>
                <kbd>{{ r2.key }}</kbd>
              </div>
            </div>
          </div>

          <!-- Corps : croix directionnelle, Select/Start, boutons d'action -->
          <div class="pad-body">
            <div class="cluster" aria-label="Croix directionnelle">
              <div class="dpad-grid">
                <div class="pad-key d-up">
                  <span class="sr-only">{{ up.label }}</span>
                  <kbd>{{ up.key }}</kbd>
                </div>
                <div class="pad-key d-left">
                  <span class="sr-only">{{ left.label }}</span>
                  <kbd>{{ left.key }}</kbd>
                </div>
                <span class="dpad-center" aria-hidden="true"></span>
                <div class="pad-key d-right">
                  <span class="sr-only">{{ right.label }}</span>
                  <kbd>{{ right.key }}</kbd>
                </div>
                <div class="pad-key d-down">
                  <span class="sr-only">{{ down.label }}</span>
                  <kbd>{{ down.key }}</kbd>
                </div>
              </div>
              <span class="cluster-label">Direction</span>
            </div>

            <div class="center-keys" aria-label="Select et Start">
              <div class="meta-key">
                <span class="meta-pill select-pill" aria-hidden="true"></span>
                <span class="meta-name">{{ select.label }}</span>
                <kbd>{{ select.key }}</kbd>
              </div>
              <div class="meta-key">
                <svg class="start-mark" viewBox="0 0 14 10" aria-hidden="true"><path d="M1 1l12 4-12 4z" /></svg>
                <span class="meta-name">{{ start.label }}</span>
                <kbd>{{ start.key }}</kbd>
              </div>
            </div>

            <div class="cluster" aria-label="Boutons d'action">
              <div class="diamond">
                <div class="face f-top">
                  <span class="btn-well" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M12 5.5l6.5 11.5h-13z" class="triangle" /></svg>
                  </span>
                  <span class="sr-only">{{ triangle.label }}</span>
                  <kbd>{{ triangle.key }}</kbd>
                </div>
                <div class="face f-left">
                  <span class="btn-well" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1" class="square" /></svg>
                  </span>
                  <span class="sr-only">{{ square.label }}</span>
                  <kbd>{{ square.key }}</kbd>
                </div>
                <div class="face f-right">
                  <span class="btn-well" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.8" class="circle" /></svg>
                  </span>
                  <span class="sr-only">{{ circle.label }}</span>
                  <kbd>{{ circle.key }}</kbd>
                </div>
                <div class="face f-bottom">
                  <span class="btn-well" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M6.8 6.8l10.4 10.4m0-10.4L6.8 17.2" class="cross" /></svg>
                  </span>
                  <span class="sr-only">{{ cross.label }}</span>
                  <kbd>{{ cross.key }}</kbd>
                </div>
              </div>
              <span class="cluster-label">Actions</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="console-heading">
        <h3 id="console-heading">Commandes de la console</h3>
        <ul class="shortcuts">
          <li>
            <svg class="s-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 8v16M21 8v16" /></svg>
            <span class="name">Pause / Reprendre</span>
            <kbd>P</kbd>
          </li>
          <li>
            <svg class="s-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 12h5l7-5v18l-7-5H6z" /><path d="M22 12a6 6 0 0 1 0 8M25 9a10 10 0 0 1 0 14" /></svg>
            <span class="name">Couper / réactiver le son</span>
            <kbd>U</kbd>
          </li>
          <li>
            <svg class="s-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="14.5" cy="14.5" r="7.5" /><path d="M20.2 20.2L26 26" /></svg>
            <span class="name">Zoom télé (3D)</span>
            <kbd>V</kbd>
          </li>
          <li>
            <svg class="s-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 5h17l4 4v18H6z" /><path d="M11 5v7h9V5M10 27v-8h12v8" /></svg>
            <span class="name">Sauvegarde rapide</span>
            <kbd>K</kbd>
          </li>
          <li>
            <svg class="s-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v15M9.5 14l6.5 6.5 6.5-6.5M6 25h20" /></svg>
            <span class="name">Charger la sauvegarde</span>
            <kbd>L</kbd>
          </li>
          <li>
            <svg class="s-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 11h14a5 5 0 0 1 5 5v2a4 4 0 0 1-7 2.5l-1.5-2h-7L10 20.5A4 4 0 0 1 3 18v-2a5 5 0 0 1 5-5z" /><path d="M10 14v4M8 16h4M22 14.5v0M24 17v0" /></svg>
            <span class="name">Afficher / fermer cette aide</span>
            <kbd>H</kbd>
          </li>
        </ul>
      </section>

      <p class="note">Position physique des touches utilisée : identique en AZERTY et en QWERTY.</p>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Fermer</button>
    </div>
  `,
  styles: `
    .dialog-head { position: relative; }
    .strip { display: flex; height: 3px; }
    .strip i { flex: 1; }
    .strip i:nth-child(1) { background: var(--gpc-ps-triangle); }
    .strip i:nth-child(2) { background: var(--gpc-ps-circle); }
    .strip i:nth-child(3) { background: var(--gpc-ps-cross); }
    .strip i:nth-child(4) { background: var(--gpc-ps-square); }

    .panel { display: grid; gap: 20px; width: min(560px, 82vw); padding-top: 16px !important; }
    .section { display: grid; gap: 12px; }
    h3 {
      margin: 0;
      color: var(--gpc-ink-soft);
      font: 600 11px/1 var(--gpc-mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .pad-schematic {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--gpc-edge);
      border-radius: 3px;
      background: var(--gpc-case);
    }
    .shoulders { display: flex; justify-content: space-between; gap: 12px; }
    .shoulder-pair { display: flex; gap: 8px; }
    .shoulder {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border: 1px solid var(--gpc-edge);
      border-radius: 3px;
      background: var(--gpc-inlay);
    }
    .shoulder-tag { font: 600 11px/1 var(--gpc-mono); color: var(--gpc-ink-soft); }

    .pad-body {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: stretch;
      gap: 16px;
      padding-top: 4px;
    }
    .cluster { display: grid; grid-template-rows: 1fr auto; align-items: center; justify-items: center; gap: 10px; }
    .cluster-label { font: 500 11px/1 var(--gpc-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--gpc-ink-soft); }

    .dpad-grid {
      display: grid;
      grid-template-columns: repeat(3, 34px);
      grid-template-rows: repeat(3, 34px);
      gap: 4px;
      align-items: center;
      justify-items: center;
    }
    .d-up { grid-column: 2; grid-row: 1; }
    .d-left { grid-column: 1; grid-row: 2; }
    .dpad-center { grid-column: 2; grid-row: 2; width: 16px; height: 16px; border-radius: 2px; background: var(--gpc-edge-soft); }
    .d-right { grid-column: 3; grid-row: 2; }
    .d-down { grid-column: 2; grid-row: 3; }
    .pad-key kbd { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; font-size: 15px; }

    .center-keys { display: grid; align-content: center; gap: 12px; justify-items: center; padding: 0 8px; }
    .meta-key { display: grid; justify-items: center; gap: 5px; text-align: center; }
    .meta-pill { display: block; width: 22px; height: 7px; border-radius: 2px; background: var(--gpc-ink); }
    .start-mark { display: block; width: 14px; height: 10px; fill: var(--gpc-ink); }
    .meta-name { font: 600 11px/1 var(--gpc-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--gpc-ink-soft); }

    .diamond {
      display: grid;
      grid-template-columns: repeat(3, 44px);
      grid-template-rows: repeat(3, auto);
      gap: 6px 4px;
      align-items: center;
      justify-items: center;
    }
    .f-top { grid-column: 2; grid-row: 1; }
    .f-left { grid-column: 1; grid-row: 2; }
    .f-right { grid-column: 3; grid-row: 2; }
    .f-bottom { grid-column: 2; grid-row: 3; }
    .face { display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .btn-well {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--gpc-spine);
    }
    .btn-well svg { width: 16px; height: 16px; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .triangle { stroke: var(--gpc-ps-triangle); }
    .circle { stroke: var(--gpc-ps-circle); }
    .cross { stroke: var(--gpc-ps-cross); }
    .square { stroke: var(--gpc-ps-square); }

    .shortcuts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 20px;
      margin: 0;
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--gpc-edge-soft);
      padding-top: 10px;
    }
    .shortcuts li { display: grid; grid-template-columns: 18px 1fr auto; gap: 10px; align-items: center; padding: 4px 0; }
    .s-icon { width: 16px; height: 16px; fill: none; stroke: var(--gpc-ink-soft); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .shortcuts .name { font-size: 13.5px; color: var(--gpc-ink); }

    kbd {
      display: inline-block;
      min-width: 24px;
      padding: 3px 7px;
      border: 1px solid var(--gpc-edge-control);
      border-bottom-width: 2px;
      border-radius: 3px;
      background: var(--gpc-inlay);
      color: var(--gpc-ink);
      font: 600 12px/1.1 var(--gpc-mono);
      text-align: center;
      white-space: nowrap;
    }

    .note { margin: 0; color: var(--gpc-ink-soft); font: 400 12.5px/1.45 Archivo, system-ui, sans-serif; }

    @media (max-width: 560px) {
      .panel { width: min(560px, 88vw); gap: 16px; }
      .pad-schematic { padding: 12px; gap: 10px; }
      .shoulders { flex-wrap: wrap; gap: 8px; }
      .shoulder-pair { gap: 6px; }
      .shoulder { gap: 6px; padding: 4px 6px; }
      .pad-body { grid-template-columns: 1fr; gap: 16px; }
      .center-keys { grid-auto-flow: column; gap: 16px; }
      .shortcuts { grid-template-columns: 1fr; }
    }
  `,
})
export class PadHelpDialogComponent {
  readonly buttons = PAD_BUTTONS;
  readonly up = byCode('ArrowUp');
  readonly down = byCode('ArrowDown');
  readonly left = byCode('ArrowLeft');
  readonly right = byCode('ArrowRight');
  readonly triangle = byCode('KeyD');
  readonly circle = byCode('KeyC');
  readonly cross = byCode('KeyX');
  readonly square = byCode('KeyS');
  readonly l1 = byCode('KeyE');
  readonly l2 = byCode('KeyF');
  readonly r1 = byCode('KeyR');
  readonly r2 = byCode('KeyT');
  readonly start = byCode('Enter');
  readonly select = byCode('Backspace');
}
