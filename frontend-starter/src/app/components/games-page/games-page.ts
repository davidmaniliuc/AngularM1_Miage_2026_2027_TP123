import { Component, Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { GamesLibraryComponent } from '../games-library/games-library';

@Component({
  selector: 'app-games-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <section class="games">
      <h1>Jeux</h1>
      <p class="summary">{{ count() }}</p>
      <nav class="subnav" aria-label="Sections des jeux">
        <a
          routerLink="/games"
          [class.active]="!onBios()"
          [attr.aria-current]="onBios() ? null : 'page'"
          >Bibliothèque</a
        >
        <a routerLink="/games/bios" routerLinkActive="active" ariaCurrentWhenActive="page">BIOS</a>
      </nav>
      <router-outlet (activate)="onActivate($event)" />
    </section>
  `,
  styles: `
    .summary { min-height: 1lh; margin: 8px 0 0; }
    .subnav { display: flex; gap: 28px; margin: 14px 0 24px; border-bottom: 1px solid var(--gpc-edge); }
    .subnav a { margin-bottom: -1px; padding: 10px 0; color: var(--gpc-ink-soft); font-size: 15px; font-weight: 600; text-decoration: none; border-bottom: 3px solid transparent; }
    .subnav a:hover { color: var(--gpc-ink); }
    .subnav a.active { color: var(--gpc-ink); border-bottom-color: var(--gpc-ink); }
  `,
})
export class GamesPageComponent {
  private readonly router = inject(Router);
  /** The library's total, shown under the title like « 27 pistes » on Musique. */
  private readonly library = signal<{ total: Signal<number>; loaded: Signal<boolean> } | null>(null);
  readonly count = computed(() => {
    const library = this.library();
    if (!library?.loaded()) return '';
    const total = library.total();
    return total + (total > 1 ? ' jeux' : ' jeu');
  });

  onActivate(component: unknown): void {
    // The BIOS tab and a game's sheet have no total: keep the last one known.
    if (component instanceof GamesLibraryComponent) this.library.set(component);
  }

  /** Bibliothèque stays the active tab on a game's sheet; only /games/bios switches it. */
  readonly onBios = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url.startsWith('/games/bios')),
    ),
    { initialValue: false },
  );
}
