import { Component, input } from '@angular/core';
import { Compat } from '../../shared/models/game.model';

/** 12px stroke mark for a compat status: check, half circle, cross, or an empty ring. */
@Component({
  selector: 'app-compat-icon',
  template: `
    <svg viewBox="0 0 12 12" aria-hidden="true">
      @switch (compat()) {
        @case ('tested') { <path d="M2.5 6.5l2.5 2.5 4.5-5.5" /> }
        @case ('issues') { <path d="M6 2.5v4.2M6 9.3v.2" /> }
        @case ('broken') { <path d="M3 3l6 6m0-6l-6 6" /> }
        @default { <circle cx="6" cy="6" r="3.2" /> }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; }
    svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  `,
})
export class CompatIconComponent {
  readonly compat = input<Compat | undefined>('untested');
}
