import { Component, computed, input } from '@angular/core';
import { Compat, compatLabel } from '../../shared/models/game.model';

/** Badge « Testé / Non testé / Ne marche pas ». The shape differs too, so colour is not the only cue. */
@Component({
  selector: 'app-compat-badge',
  template: `
    <span class="badge" [attr.data-compat]="compat()" data-testid="compat">
      <svg viewBox="0 0 12 12" aria-hidden="true">
        @switch (compat()) {
          @case ('tested') { <path d="M2.500 6.500l2.500 2.500 4.500-5.500" /> }
          @case ('broken') { <path d="M3 3l6 6m0-6l-6 6" /> }
          @default { <circle cx="6" cy="6" r="3.200" /> }
        }
      </svg>
      {{ label() }}
    </span>
  `,
  styles: `
    .badge { display: inline-flex; align-items: center; gap: 5px; font: 600 11px/1 var(--gpc-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--gpc-ink-soft); }
    svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    [data-compat='tested'] { color: var(--gpc-ps-triangle); }
    [data-compat='broken'] { color: var(--gpc-ps-circle); }
  `,
})
export class CompatBadgeComponent {
  readonly compat = input<Compat | undefined>('untested');
  readonly label = computed(() => compatLabel(this.compat()));
}
