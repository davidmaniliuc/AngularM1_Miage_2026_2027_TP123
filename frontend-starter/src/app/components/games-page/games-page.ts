import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Subscription } from 'rxjs';
import { GameService } from '../../shared/services/game.service';
import { Game, GameInput } from '../../shared/models/game.model';
import { Page } from '../../shared/models/page.model';
import { GameFormComponent } from '../game-form/game-form';

@Component({
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatIconModule, MatPaginatorModule, GameFormComponent],
  templateUrl: './games-page.html', styleUrl: './games-page.css',
})
export class GamesPageComponent {
  private readonly service = inject(GameService);
  private readonly destroyRef = inject(DestroyRef);
  private listRequest?: Subscription;
  readonly query = signal('');
  readonly search = new FormControl('', { nonNullable: true });
  readonly result = signal<Page<Game> | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saveError = signal('');
  readonly creating = signal(false);
  readonly saving = signal(false);
  private page = 1;
  private limit = 5;

  constructor() { this.load(); }

  load(): void {
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.listRequest = this.service.list(this.page, this.limit, this.query()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { this.result.set(result); this.loading.set(false); },
      error: (error: { status?: number }) => {
        console.error('[GamesPage] Chargement impossible', error.status);
        this.error.set('Impossible de charger les jeux. Réessayez.'); this.loading.set(false);
      },
    });
  }
  searchGames(): void { this.query.set(this.search.value.trim().slice(0, 200)); this.page = 1; this.load(); }
  changePage(event: PageEvent): void { this.page = event.pageIndex + 1; this.limit = event.pageSize; this.load(); }
  openCreate(): void { this.saveError.set(''); this.creating.set(true); }
  create(input: GameInput): void {
    if (this.saving()) return;
    this.saving.set(true); this.saveError.set('');
    this.service.create(input).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        console.debug('[GamesPage] Jeu créé');
        this.saving.set(false); this.creating.set(false); this.search.setValue(''); this.query.set(''); this.page = 1; this.load();
      },
      error: (error: { status?: number; error?: { message?: string } }) => {
        console.error('[GamesPage] Enregistrement impossible', error.status);
        this.saveError.set(error.error?.message ?? 'Impossible d’enregistrer le jeu. Réessayez.'); this.saving.set(false);
      },
    });
  }
}
