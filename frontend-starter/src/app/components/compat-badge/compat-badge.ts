import { Component, computed, input } from '@angular/core';
import { Compat, compatLabel } from '../../shared/models/game.model';
import { CompatIconComponent } from './compat-icon';

/** Badge « Non testé / Marche / Problèmes / Ne marche pas ». The shape differs too, so colour is not the only cue. */
@Component({
  selector: 'app-compat-badge',
  imports: [CompatIconComponent],
  template: `
    <span class="badge" [attr.data-compat]="compat()" data-testid="compat">
      <app-compat-icon [compat]="compat()" />
      {{ label() }}
    </span>
  `,
  styles: `
    .badge { display: inline-flex; align-items: center; gap: 5px; font: 600 11px/1 var(--gpc-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--gpc-ink-soft); }
    [data-compat='tested'] { color: var(--gpc-compat-ok); }
    [data-compat='issues'] { color: var(--gpc-compat-issues); }
    [data-compat='broken'] { color: var(--gpc-compat-broken); }
  `,
})
export class CompatBadgeComponent {
  readonly compat = input<Compat | undefined>('untested');
  readonly label = computed(() => compatLabel(this.compat()));
}
