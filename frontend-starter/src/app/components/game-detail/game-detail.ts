import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Game, genreLabel, regionLabel } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { GameCoverComponent } from '../game-cover/game-cover';
import { GameFormDialogComponent } from '../game-form-dialog/game-form-dialog';
import { formatSize } from '../../shared/utils/audio-file';

/** Game sheet: cover, serial, genre, region, year, favorite, with edit and delete. */
@Component({
  selector: 'app-game-detail',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, GameCoverComponent],
  template: `
    <a routerLink="/games" class="back"><mat-icon>arrow_back</mat-icon>Bibliothèque</a>

    @if (notFound()) {
      <p class="error" role="alert">{{ notFound() }}</p>
    } @else if (game(); as game) {
      <!-- Une action ratée ne cache pas la fiche : bandeau au-dessus. -->
      @if (actionError()) {
        <div class="banner" role="alert">
          <mat-icon class="icon-fill">error</mat-icon>
          <span>{{ actionError() }}</span>
          <button mat-icon-button type="button" (click)="actionError.set('')" aria-label="Fermer le message">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      <article class="sheet">
        <div class="case">
          <span class="spine" aria-hidden="true"><span>{{ game.serial || 'PS1' }}</span></span>
          <app-game-cover [game]="game" [alt]="'Pochette de ' + game.title" />
        </div>
        <div class="info">
          <h2>{{ game.title }}</h2>
          <dl>
            <dt>Numéro de série</dt>
            <dd data-testid="serial" class="mono">{{ game.serial || '—' }}</dd>
            <dt>Genre</dt>
            <dd data-testid="genre">{{ genre(game) || '—' }}</dd>
            <dt>Région</dt>
            <dd data-testid="region">{{ region(game) || '—' }}</dd>
            <dt>Année</dt>
            <dd data-testid="year" class="mono">{{ game.year || '—' }}</dd>
            <dt>Fichier du jeu</dt>
            <dd data-testid="disc">{{ game.disc ? game.disc.name + ' (' + formatSize(game.disc.size) + ')' : 'Aucun' }}</dd>
          </dl>
          <div class="actions">
            <button mat-button type="button" data-testid="favorite" [attr.aria-pressed]="game.favorite" (click)="toggleFavorite(game)">
              <mat-icon [class.icon-fill]="game.favorite">favorite</mat-icon>{{ game.favorite ? 'Favori' : 'Ajouter aux favoris' }}
            </button>
            <button mat-flat-button type="button" data-testid="edit" (click)="edit(game)">Modifier</button>
            <button mat-button type="button" class="delete" data-testid="delete" (click)="confirmRemove(game)">Supprimer</button>
          </div>
        </div>
      </article>
    } @else {
      <mat-progress-bar mode="indeterminate" aria-label="Chargement du jeu" />
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; color: var(--gpc-ink-soft); font-size: 14px; font-weight: 600; text-decoration: none; }
    .back:hover { color: var(--gpc-ink); }
    .back mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .sheet { display: grid; grid-template-columns: minmax(200px, 320px) minmax(0, 1fr); gap: 40px; align-items: start; }
    .case {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      border: 1px solid var(--gpc-edge);
      border-radius: 2px;
      background: var(--gpc-inlay);
      box-shadow: 0 22px 36px -22px #000b;
    }
    .spine { display: flex; justify-content: center; padding: 12px 0; background: var(--gpc-spine); color: var(--gpc-spine-ink); }
    .spine span { writing-mode: vertical-rl; transform: rotate(180deg); font: 500 11px/1 var(--gpc-mono); letter-spacing: 0.14em; }
    app-game-cover { margin: 4px; }
    h2 { margin: 4px 0 20px; font-size: 30px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; text-wrap: balance; }
    dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); margin: 0 0 24px; border-top: 1px solid var(--gpc-edge); }
    dt, dd { padding: 10px 0; border-bottom: 1px solid var(--gpc-edge-soft); }
    dt { padding-right: 24px; color: var(--gpc-ink-soft); font-size: 13px; }
    dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    dd.mono { font-weight: 500; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .actions button[data-testid='favorite'][aria-pressed='true'] mat-icon { color: var(--gpc-ps-circle); }
    .delete { --mat-button-text-label-text-color: var(--mat-sys-error); }
    .error { color: var(--mat-sys-error); }
    .banner {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 20px;
      padding: 4px 4px 4px 14px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
      border-radius: 3px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .banner > mat-icon { color: var(--mat-sys-error); }
    @media (max-width: 640px) { .sheet { grid-template-columns: 1fr; gap: 24px; } .case { max-width: 300px; } }
  `,
})
export class GameDetailComponent {
  private readonly service = inject(GameService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly game = signal<Game | undefined>(undefined);
  /** Load failure: the sheet cannot be shown. */
  readonly notFound = signal('');
  /** A favorite or delete that failed: the sheet stays. */
  readonly actionError = signal('');
  readonly genre = (game: Game) => genreLabel(game.genre);
  readonly region = (game: Game) => regionLabel(game.region);
  readonly formatSize = formatSize;

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
    this.service.get(id).subscribe({
      next: (game) => this.game.set(game),
      error: (error) => {
        console.error('[GameDetail] Chargement impossible', error);
        this.notFound.set('Jeu introuvable.');
      },
    });
  }

  toggleFavorite(game: Game): void {
    this.service.setFavorite(game.id, !game.favorite).subscribe({
      next: (updated) => this.game.set(updated),
      error: (error) => {
        console.error('[GameDetail] Favori impossible', error);
        this.actionError.set('Impossible de modifier ce favori. Réessayez.');
      },
    });
  }

  edit(game: Game): void {
    this.dialog
      .open<GameFormDialogComponent, Game, Game>(GameFormDialogComponent, { data: game })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.game.set(saved);
      });
  }

  confirmRemove(game: Game): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Supprimer ce jeu ?',
          message: `« ${game.title} » sera définitivement supprimé de votre bibliothèque.`,
          confirm: 'Supprimer',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.remove(game);
      });
  }

  private remove(game: Game): void {
    this.service.remove(game.id).subscribe({
      next: () => void this.router.navigateByUrl('/games'),
      error: (error) => {
        console.error('[GameDetail] Suppression impossible', error);
        this.actionError.set('La suppression a échoué. Réessayez.');
      },
    });
  }
}
