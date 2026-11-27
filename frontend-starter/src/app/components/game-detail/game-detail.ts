import { Component, inject, linkedSignal, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CompatIconComponent } from '../compat-badge/compat-icon';
import { COMPAT_STATUSES, Compat, Game, genreLabel, regionLabel } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { GameCoverComponent } from '../game-cover/game-cover';
import { GameFormDialogComponent } from '../game-form-dialog/game-form-dialog';
import { formatSize } from '../../shared/utils/audio-file';

/** Game sheet: cover, serial, genre, region, year, favorite, with edit and delete. */
@Component({
  selector: 'app-game-detail',
  imports: [RouterLink, MatButtonModule, MatIconModule, GameCoverComponent, CompatIconComponent],
  template: `
    <a routerLink="/games" class="back"><mat-icon>arrow_back</mat-icon>Bibliothèque</a>

    @if (notFound()) {
      <div class="banner" role="alert">
        <mat-icon class="icon-fill">error</mat-icon>
        <span>{{ notFound() }}</span>
      </div>
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
          <span class="spine" aria-hidden="true">
            <span class="serial">{{ game.serial || 'PS1' }}</span>
            @if (game.region) { <span class="region">{{ game.region.toUpperCase() }}</span> }
          </span>
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
            <dt>Émulateur</dt>
            <dd class="compat">
              <!-- Un seul contrôle : le segment choisi est le statut, pas de badge en double. -->
              <div class="segments" role="radiogroup" aria-label="Résultat du test dans l'émulateur" data-testid="compat-select">
                @for (item of compats; track item.value) {
                  <label [attr.data-compat]="item.value">
                    <input
                      type="radio"
                      name="compat"
                      [value]="item.value"
                      [checked]="shownCompat() === item.value"
                      [disabled]="savingCompat()"
                      (change)="setCompat(game, item.value)"
                    />
                    <app-compat-icon [compat]="item.value" />
                    {{ item.label }}
                  </label>
                }
              </div>
            </dd>
            <dt>Fichier du jeu</dt>
            <dd data-testid="disc" class="disc-cell">
              @if (game.disc; as disc) {
                <span class="fmt mono">{{ disc.format.toUpperCase() }}</span>
                <span class="disc-name">{{ disc.name }}</span>
                <span class="disc-size mono">({{ formatSize(disc.size) }})</span>
              } @else {
                <span class="none">Aucun</span>
              }
            </dd>
          </dl>
          <div class="actions">
            @if (game.disc) {
              <a mat-flat-button class="play" data-testid="play" [routerLink]="['/games', game.id, 'play']">
                <mat-icon>play_arrow</mat-icon>Jouer
              </a>
              <button mat-stroked-button type="button" data-testid="edit" (click)="edit(game)">
                <mat-icon>edit</mat-icon>Modifier
              </button>
            } @else {
              <button mat-flat-button type="button" data-testid="edit" (click)="edit(game)">
                <mat-icon>edit</mat-icon>Modifier
              </button>
            }
            <button
              mat-stroked-button
              type="button"
              class="fav-btn"
              data-testid="favorite"
              [attr.aria-pressed]="game.favorite"
              (click)="toggleFavorite(game)"
            >
              <mat-icon [class.icon-fill]="game.favorite">favorite</mat-icon>{{ game.favorite ? 'Favori' : 'Ajouter aux favoris' }}
            </button>
            <button mat-button type="button" class="delete" data-testid="delete" (click)="confirmRemove(game)">
              <mat-icon>delete</mat-icon>Supprimer
            </button>
          </div>
        </div>
      </article>
    } @else {
      <div class="sheet skeleton" role="status" aria-label="Chargement du jeu">
        <div class="skel-case" aria-hidden="true">
          <span class="skel-spine"></span>
          <span class="skel-art"></span>
        </div>
        <div class="skel-info" aria-hidden="true">
          <span class="skel-title"></span>
          <span class="skel-row"></span>
          <span class="skel-row"></span>
          <span class="skel-row"></span>
          <span class="skel-row short"></span>
        </div>
      </div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 20px; color: var(--gpc-ink-soft); font-size: 14px; font-weight: 600; text-decoration: none; }
    .back:hover { color: var(--gpc-ink); }
    .back mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .sheet { display: grid; grid-template-columns: minmax(200px, 320px) minmax(0, 1fr); gap: 40px; align-items: start; }
    .case {
      position: relative;
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      border: 1px solid var(--gpc-edge);
      border-radius: 2px;
      background: var(--gpc-inlay);
      box-shadow: 0 22px 36px -22px #000b;
      overflow: hidden;
    }
    .case::after {
      content: '';
      position: absolute;
      inset: 0 0 0 30px;
      background: linear-gradient(115deg, #ffffff4d 0, #ffffff14 24%, transparent 36%);
      box-shadow: inset 0 1px 0 #ffffff59;
      pointer-events: none;
    }
    .spine {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      background: var(--gpc-spine);
      color: var(--gpc-spine-ink);
      border-right: 1px solid #2a2a2e;
    }
    .spine span { writing-mode: vertical-rl; transform: rotate(180deg); font: 500 11px/1 var(--gpc-mono); letter-spacing: 0.14em; white-space: nowrap; }
    .spine .region { color: var(--gpc-spine-ink-soft); }
    app-game-cover { margin: 4px; }
    h2 { margin: 4px 0 20px; font-size: 30px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; text-wrap: balance; }
    dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); margin: 0 0 24px; border-top: 1px solid var(--gpc-edge); }
    dt, dd { padding: 10px 0; border-bottom: 1px solid var(--gpc-edge-soft); }
    dt { padding-right: 24px; color: var(--gpc-ink-soft); font-size: 13px; }
    dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    dd.mono { font-weight: 500; }
    dd.compat { padding: 6px 0; }
    .disc-cell { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; }
    .fmt {
      padding: 2px 6px;
      border: 1px solid light-dark(var(--gpc-spine), #3a3c44);
      border-radius: 2px;
      background: var(--gpc-spine);
      color: var(--gpc-spine-ink);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.08em;
    }
    .disc-size, .none { color: var(--gpc-ink-soft); font-weight: 400; font-size: 13px; }
    .segments {
      display: inline-flex;
      flex-wrap: wrap;
      border: 1px solid var(--gpc-edge-control);
      border-radius: 3px;
      background: var(--gpc-inlay);
      overflow: hidden;
    }
    .segments label {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      color: var(--gpc-ink-soft);
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }
    .segments label + label { border-left: 1px solid var(--gpc-edge-soft); }
    .segments label:hover { color: var(--gpc-ink); }
    .segments input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: inherit; }
    .segments label:has(input:focus-visible) { outline: 2px solid var(--gpc-ps-cross); outline-offset: -2px; z-index: 1; }
    .segments label:has(input:disabled) { cursor: progress; }
    /* L'icône garde la couleur du statut ; le segment choisi est en encre pleine. */
    [data-compat='tested'] app-compat-icon { color: var(--gpc-compat-ok); }
    [data-compat='issues'] app-compat-icon { color: var(--gpc-compat-issues); }
    [data-compat='broken'] app-compat-icon { color: var(--gpc-compat-broken); }
    .segments label:has(input:checked) { background: var(--gpc-ink); color: var(--mat-sys-on-primary); }
    .segments label:has(input:checked) app-compat-icon { color: inherit; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .actions a, .actions button { height: 40px; }
    .actions button[data-testid='favorite'][aria-pressed='true'] mat-icon { color: var(--gpc-ps-circle); }
    .delete { margin-left: auto; --mat-button-text-label-text-color: var(--mat-sys-error); }
    .banner {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 20px;
      padding: 8px 8px 8px 14px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
      border-radius: 3px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .banner > mat-icon { color: var(--mat-sys-error); }

    /* Squelette discret au format boîtier. */
    .skel-case {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      aspect-ratio: 1.09;
      border: 1px solid var(--gpc-edge-soft);
      border-radius: 2px;
      background: var(--gpc-inlay);
      overflow: hidden;
    }
    .skel-spine { background: var(--gpc-spine); opacity: 0.35; }
    .skel-art { margin: 4px; background: var(--gpc-edge-soft); opacity: 0.5; }
    .skel-info { display: grid; gap: 14px; padding-top: 6px; }
    .skel-title { width: 58%; height: 32px; border-radius: 2px; background: var(--gpc-edge-soft); }
    .skel-row { width: 100%; height: 18px; border-radius: 2px; background: var(--gpc-edge-soft); opacity: 0.6; }
    .skel-row.short { width: 45%; }

    @media (max-width: 720px) {
      .sheet { grid-template-columns: 1fr; gap: 24px; }
      .case, .skel-case { max-width: 280px; }
      .delete { margin-left: 0; }
    }
    @media (max-width: 520px) {
      dl { grid-template-columns: 1fr; }
      dt { padding: 10px 0 2px; border-bottom: 0; }
      dd { padding: 0 0 10px; }
      .segments { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
      .segments label { border-left: 0 !important; border-top: 1px solid var(--gpc-edge-soft); }
      .segments label:nth-child(-n+2) { border-top: 0; }
      .segments label:nth-child(even) { border-left: 1px solid var(--gpc-edge-soft) !important; }
    }
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
  readonly compats = COMPAT_STATUSES;
  readonly savingCompat = signal(false);
  /** The segment shown: moves at once, comes back if the server refuses. */
  readonly shownCompat = linkedSignal(() => this.game()?.compat);

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

  setCompat(game: Game, compat: Compat): void {
    this.savingCompat.set(true);
    this.shownCompat.set(compat);
    this.service.setCompat(game.id, compat).subscribe({
      next: (updated) => {
        this.savingCompat.set(false);
        this.game.set(updated);
      },
      error: (error) => {
        this.savingCompat.set(false);
        this.shownCompat.set(game.compat);
        console.error('[GameDetail] Statut impossible', error);
        this.actionError.set('Impossible de changer le résultat du test. Réessayez.');
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
