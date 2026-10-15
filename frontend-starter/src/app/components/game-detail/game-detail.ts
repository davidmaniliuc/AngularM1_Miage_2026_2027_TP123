import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Game, genreLabel } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { GameCoverComponent } from '../game-cover/game-cover';
import { GameFormDialogComponent } from '../game-form-dialog/game-form-dialog';

/** Game sheet: cover, serial, genre, with edit and delete. */
@Component({
  selector: 'app-game-detail',
  imports: [RouterLink, MatButtonModule, MatIconModule, GameCoverComponent],
  template: `
    <a routerLink="/games" class="back"><mat-icon>arrow_back</mat-icon>Bibliothèque</a>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (game(); as game) {
      <article class="sheet">
        <app-game-cover [game]="game" [alt]="'Pochette de ' + game.title" />
        <div class="info">
          <h2>{{ game.title }}</h2>
          <dl>
            <dt>Numéro de série</dt>
            <dd data-testid="serial">{{ game.serial || '—' }}</dd>
            <dt>Genre</dt>
            <dd data-testid="genre">{{ genre(game) || '—' }}</dd>
          </dl>
          <div class="actions">
            <button mat-flat-button type="button" data-testid="edit" (click)="edit(game)">Modifier</button>
            <button mat-button type="button" data-testid="delete" (click)="confirmRemove(game)">Supprimer</button>
          </div>
        </div>
      </article>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 16px; color: var(--mat-sys-on-surface-variant); text-decoration: none; font-size: 14px; }
    .sheet { display: grid; grid-template-columns: minmax(160px, 260px) 1fr; gap: 24px; }
    app-game-cover { border-radius: 14px; overflow: hidden; }
    h2 { margin: 0 0 12px; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0 0 20px; }
    dt { color: var(--mat-sys-on-surface-variant); }
    dd { margin: 0; font-weight: 500; }
    .error { color: var(--mat-sys-error); }
    @media (max-width: 560px) { .sheet { grid-template-columns: 1fr; } }
  `,
})
export class GameDetailComponent {
  private readonly service = inject(GameService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly game = signal<Game | undefined>(undefined);
  readonly error = signal('');
  readonly genre = (game: Game) => genreLabel(game.genre);

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
    this.service.get(id).subscribe({
      next: (game) => this.game.set(game),
      error: (error) => {
        console.error('[GameDetail] Chargement impossible', error);
        this.error.set('Jeu introuvable.');
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
        this.error.set('La suppression a échoué.');
      },
    });
  }
}
