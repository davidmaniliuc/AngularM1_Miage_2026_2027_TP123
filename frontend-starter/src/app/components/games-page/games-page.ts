import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-games-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <section class="games">
      <h1>Jeux</h1>
      <nav class="subnav" aria-label="Sections des jeux">
        <a
          routerLink="/games"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          >Bibliothèque</a
        >
        <a routerLink="/games/bios" routerLinkActive="active" ariaCurrentWhenActive="page">BIOS</a>
      </nav>
      <router-outlet />
    </section>
  `,
  styles: `
    .games { max-width: 1080px; margin: 0 auto; padding: 32px 16px; }
    .subnav { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .subnav a { padding: 8px 14px; color: var(--mat-sys-on-surface-variant); font-size: 14px; font-weight: 500; text-decoration: none; border-bottom: 2px solid transparent; }
    .subnav a.active { color: var(--mat-sys-on-surface); border-bottom-color: var(--mat-sys-primary); }
  `,
})
export class GamesPageComponent {}
