import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Game, genreLabel } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { GameCoverComponent } from '../game-cover/game-cover';
import { GameFormDialogComponent } from '../game-form-dialog/game-form-dialog';

@Component({
  selector: 'app-games-library',
  imports: [RouterLink, MatButtonModule, MatIconModule, GameCoverComponent],
  template: `
    <div class="bar">
      <button mat-flat-button type="button" data-testid="add-game" (click)="add()">
        <mat-icon>add</mat-icon>Ajouter un jeu
      </button>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (loaded() && games().length === 0) {
      <p class="empty">Aucun jeu pour l'instant.</p>
    }

    <ul class="games">
      @for (game of games(); track game.id) {
        <li>
          <a [routerLink]="['/games', game.id]" data-testid="game-link">
            <app-game-cover [game]="game" />
            <b>{{ game.title }}</b>
            <small>{{ subtitle(game) }}</small>
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    .bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
    .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
    a { display: grid; gap: 4px; color: var(--mat-sys-on-surface); text-decoration: none; }
    app-game-cover { border-radius: 12px; overflow: hidden; }
    small { color: var(--mat-sys-on-surface-variant); }
    .empty { color: var(--mat-sys-on-surface-variant); }
    .error { color: var(--mat-sys-error); }
  `,
})
export class GamesLibraryComponent {
  private readonly service = inject(GameService);
  private readonly dialog = inject(MatDialog);

  readonly games = signal<Game[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');

  constructor() {
    this.service.list().subscribe({
      next: (games) => {
        this.games.set(games);
        this.loaded.set(true);
      },
      error: (error) => {
        console.error('[GamesLibrary] Chargement impossible', error);
        this.error.set('Impossible de charger vos jeux.');
      },
    });
  }

  subtitle(game: Game): string {
    return [game.serial, genreLabel(game.genre)].filter(Boolean).join(' · ');
  }

  add(): void {
    this.dialog
      .open<GameFormDialogComponent, void, Game>(GameFormDialogComponent)
      .afterClosed()
      .subscribe((created) => {
        if (created) this.games.update((games) => [created, ...games]);
      });
  }
}
