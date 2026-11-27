import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { PAD_BUTTONS } from '../../shared/utils/pad';

/** The pad buttons and the keyboard keys that press them. */
@Component({
  selector: 'app-pad-help-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Touches du clavier</h2>
    <div mat-dialog-content data-testid="help-panel">
        <ul>
          @for (button of buttons; track button.code) {
            <li>
              <svg class="icon" viewBox="0 0 32 32" aria-hidden="true">
                @switch (button.icon) {
                  @case ('triangle') { <path d="M16 6l8.5 15h-17z" class="triangle" /> }
                  @case ('circle') { <circle cx="16" cy="16" r="8" class="circle" /> }
                  @case ('cross') { <path d="M8.5 8.5l15 15m0-15l-15 15" class="cross" /> }
                  @case ('square') { <rect x="8" y="8" width="16" height="16" rx="1.5" class="square" /> }
                  @case ('shoulder') {
                    <rect x="2" y="9" width="28" height="14" rx="6" class="pill" />
                    <text x="16" y="20" text-anchor="middle" class="caption">{{ button.label }}</text>
                  }
                  @case ('start') {
                    <rect x="2" y="9" width="28" height="14" rx="7" class="pill" />
                    <path d="M13 12.5l7 3.5-7 3.5z" class="solid" />
                  }
                  @case ('select') {
                    <rect x="2" y="9" width="28" height="14" rx="7" class="pill" />
                    <rect x="11" y="13.5" width="10" height="5" rx="1" class="solid" />
                  }
                  @default {
                    <path d="M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9z" class="dpad" />
                    @switch (button.icon) {
                      @case ('up') { <path d="M16 6l3.5 4.5h-7z" class="arrow" /> }
                      @case ('down') { <path d="M16 26l3.5-4.5h-7z" class="arrow" /> }
                      @case ('left') { <path d="M6 16l4.5-3.5v7z" class="arrow" /> }
                      @case ('right') { <path d="M26 16l-4.5-3.5v7z" class="arrow" /> }
                    }
                  }
                }
              </svg>
              <span class="name">{{ button.label }}</span>
              <kbd>{{ button.key }}</kbd>
            </li>
          }
          <li><span class="icon"></span><span class="name">Pause</span><kbd>P</kbd></li>
          <li><span class="icon"></span><span class="name">Sauvegarde rapide</span><kbd>K</kbd></li>
          <li><span class="icon"></span><span class="name">Charger la sauvegarde</span><kbd>L</kbd></li>
          <li><span class="icon"></span><span class="name">Cette aide</span><kbd>H</kbd></li>
        </ul>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Fermer</button>
    </div>
  `,
  styles: `
    ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 4px 24px; margin: 0; padding: 0; list-style: none; }
    ul li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; }
    ul .name { color: var(--gpc-ink-soft); }
    .icon { width: 32px; height: 32px; fill: none; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
    .icon .triangle { stroke: var(--gpc-ps-triangle); }
    .icon .circle { stroke: var(--gpc-ps-circle); }
    .icon .cross { stroke: var(--gpc-ps-cross); }
    .icon .square { stroke: var(--gpc-ps-square); }
    .icon .dpad { stroke: var(--gpc-edge); fill: var(--gpc-inlay); stroke-width: 1.6; }
    .icon .arrow, .icon .solid { fill: var(--gpc-ink); stroke: none; }
    .icon .pill { stroke: var(--gpc-edge); fill: var(--gpc-inlay); stroke-width: 1.6; }
    .icon .caption { fill: var(--gpc-ink); stroke: none; font: 700 9px var(--gpc-mono); }
    kbd { padding: 2px 8px; border: 1px solid var(--gpc-edge); border-radius: 3px; font: 500 13px var(--gpc-mono); }
  `,
})
export class PadHelpDialogComponent {
  readonly buttons = PAD_BUTTONS;
}
