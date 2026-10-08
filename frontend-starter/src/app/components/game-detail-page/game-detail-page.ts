import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { Game, GameInput } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { GameFormComponent } from '../game-form/game-form';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

@Component({
  imports: [RouterLink, DatePipe, MatButtonModule, MatIconModule, GameFormComponent],
  templateUrl: './game-detail-page.html', styleUrl: './game-detail-page.css',
})
export class GameDetailPageComponent {
  private readonly service = inject(GameService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private mutation?: Subscription;
  private id = '';
  readonly game = signal<Game | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly editing = signal(false);
  readonly pending = signal(false);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.id = params.get('id') ?? '';
      this.mutation?.unsubscribe();
      this.pending.set(false);
      this.editing.set(false);
      this.actionError.set('');
      this.load();
    });
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true); this.error.set(''); this.game.set(null);
    this.request = this.service.get(this.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: game => { this.game.set(game); this.loading.set(false); },
      error: (error: { status?: number }) => {
        console.error('[GameDetail] Chargement impossible', error.status);
        this.error.set(error.status === 404 ? 'Jeu introuvable ou inaccessible.' : 'Impossible de charger ce jeu. Réessayez.');
        this.loading.set(false);
      },
    });
  }
  startEdit(): void { this.actionError.set(''); this.editing.set(true); }
  save(input: GameInput): void {
    const game = this.game();
    if (!game || this.pending()) return;
    this.pending.set(true); this.actionError.set('');
    this.mutation = this.service.update(game.id, input).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { console.debug('[GameDetail] Jeu modifié'); this.game.set(updated); this.editing.set(false); this.pending.set(false); },
      error: (error: { status?: number; error?: { message?: string } }) => {
        console.error('[GameDetail] Modification impossible', error.status);
        this.actionError.set(error.error?.message ?? 'Impossible d’enregistrer le jeu. Réessayez.'); this.pending.set(false);
      },
    });
  }
  confirmDelete(): void {
    const game = this.game();
    if (!game || this.pending()) return;
    const dialog = this.dialogs.open(ConfirmDialogComponent, { data: {
      title: 'Supprimer ce jeu ?', message: `La fiche « ${game.title} » sera supprimée de votre bibliothèque.`, confirm: 'Supprimer',
    } });
    dialog.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(confirmed => {
      if (confirmed !== true || this.id !== game.id || this.pending()) return;
      this.pending.set(true); this.actionError.set('');
      this.mutation = this.service.remove(game.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { console.debug('[GameDetail] Jeu supprimé'); void this.router.navigateByUrl('/games'); },
        error: (error: { status?: number }) => {
          console.error('[GameDetail] Suppression impossible', error.status);
          this.actionError.set('Impossible de supprimer le jeu. Réessayez.'); this.pending.set(false);
        },
      });
    });
    this.destroyRef.onDestroy(() => dialog.close());
  }
}
