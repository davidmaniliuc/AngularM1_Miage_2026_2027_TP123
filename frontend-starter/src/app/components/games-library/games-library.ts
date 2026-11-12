import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { switchMap, tap } from 'rxjs';
import {
  GENRES,
  Game,
  GameListQuery,
  GameSort,
  REGIONS,
  Genre,
  Region,
  genreLabel,
} from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { GameCoverComponent } from '../game-cover/game-cover';
import { GameFormDialogComponent } from '../game-form-dialog/game-form-dialog';

const DEFAULT_LIMIT = 24;
const SORTS: { value: string; label: string; sort: GameSort; order: 'asc' | 'desc' }[] = [
  { value: 'added-desc', label: 'Ajoutés récemment', sort: 'added', order: 'desc' },
  { value: 'added-asc', label: 'Ajoutés en premier', sort: 'added', order: 'asc' },
  { value: 'title-asc', label: 'Titre (A → Z)', sort: 'title', order: 'asc' },
  { value: 'title-desc', label: 'Titre (Z → A)', sort: 'title', order: 'desc' },
  { value: 'year-desc', label: 'Année (récentes)', sort: 'year', order: 'desc' },
  { value: 'year-asc', label: 'Année (anciennes)', sort: 'year', order: 'asc' },
];

/**
 * Cover grid. The filters, sort and page live in the URL query string
 * (?q=&region=&genre=&favorite=true&sort=&order=&page=&limit=), so a reload
 * or a shared link shows the same list; the backend does the filtering.
 */
@Component({
  selector: 'app-games-library',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    GameCoverComponent,
  ],
  template: `
    <div class="bar">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
        <mat-label>Rechercher</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          type="search"
          placeholder="Titre ou numéro de série"
          data-testid="search"
          [value]="query().q ?? ''"
          (input)="onSearch($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Région</mat-label>
        <mat-select data-testid="region" [value]="query().region ?? ''" (selectionChange)="setFilter('region', $event.value)">
          <mat-option value="">Toutes</mat-option>
          @for (region of regions; track region.value) {
            <mat-option [value]="region.value">{{ region.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Genre</mat-label>
        <mat-select data-testid="genre" [value]="query().genre ?? ''" (selectionChange)="setFilter('genre', $event.value)">
          <mat-option value="">Tous</mat-option>
          @for (genre of genres; track genre.value) {
            <mat-option [value]="genre.value">{{ genre.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Trier par</mat-label>
        <mat-select data-testid="sort" [value]="sortValue()" (selectionChange)="setSort($event.value)">
          @for (option of sorts; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button
        mat-stroked-button
        type="button"
        data-testid="favorites-filter"
        [attr.aria-pressed]="!!query().favorite"
        (click)="setFilter('favorite', query().favorite ? '' : 'true')"
      >
        <mat-icon [class.icon-fill]="query().favorite">favorite</mat-icon>Favoris
      </button>
      <button mat-flat-button type="button" class="add" data-testid="add-game" (click)="add()">
        <mat-icon>add</mat-icon>Ajouter un jeu
      </button>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (loaded() && games().length === 0) {
      <p class="empty">{{ hasFilters() ? 'Aucun jeu ne correspond à ces filtres.' : "Aucun jeu pour l'instant." }}</p>
    }

    <ul class="games">
      @for (game of games(); track game.id) {
        <li>
          <a [routerLink]="['/games', game.id]" data-testid="game-link">
            <app-game-cover [game]="game" />
            <b>{{ game.title }}</b>
            <small>{{ subtitle(game) }}</small>
          </a>
          <button
            type="button"
            class="fav"
            data-testid="favorite"
            [attr.aria-pressed]="game.favorite"
            [attr.aria-label]="(game.favorite ? 'Retirer des favoris : ' : 'Ajouter aux favoris : ') + game.title"
            (click)="toggleFavorite(game)"
          >
            <mat-icon [class.icon-fill]="game.favorite">favorite</mat-icon>
          </button>
        </li>
      }
    </ul>

    @if (total() > 0) {
      <mat-paginator
        [length]="total()"
        [pageIndex]="page() - 1"
        [pageSize]="limit()"
        [pageSizeOptions]="[12, 24, 48]"
        (page)="onPage($event)"
        aria-label="Pagination des jeux"
      />
    }
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 20px; }
    .bar mat-form-field { width: 160px; }
    .bar .search { flex: 1 1 220px; }
    .bar .add { margin-left: auto; }
    .games { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 0; padding: 0; list-style: none; }
    @media (min-width: 600px) { .games { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 760px) { .games { grid-template-columns: repeat(4, 1fr); } }
    @media (min-width: 900px) { .games { grid-template-columns: repeat(5, 1fr); } }
    @media (min-width: 1040px) { .games { grid-template-columns: repeat(6, 1fr); } }
    li { position: relative; }
    a { display: grid; gap: 4px; color: var(--mat-sys-on-surface); text-decoration: none; }
    app-game-cover { border-radius: 12px; overflow: hidden; }
    small { color: var(--mat-sys-on-surface-variant); }
    .fav { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--mat-sys-surface) 80%, transparent); color: var(--mat-sys-primary); cursor: pointer; }
    .empty { color: var(--mat-sys-on-surface-variant); }
    .error { color: var(--mat-sys-error); }
  `,
})
export class GamesLibraryComponent {
  private readonly service = inject(GameService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly regions = REGIONS;
  readonly genres = GENRES;
  readonly sorts = SORTS;

  readonly games = signal<Game[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly query = signal<GameListQuery>({});
  readonly page = signal(1);
  readonly limit = signal(DEFAULT_LIMIT);
  readonly total = signal(0);

  constructor() {
    this.route.queryParamMap
      .pipe(
        tap((params) => {
          const query = this.parse(params.keys.reduce((all, key) => ({ ...all, [key]: params.get(key) }), {}));
          this.query.set(query);
          this.page.set(query.page ?? 1);
          this.limit.set(query.limit ?? DEFAULT_LIMIT);
          this.error.set('');
        }),
        switchMap(() => this.service.list(this.query())),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (response) => {
          this.games.set(response.items);
          this.total.set(response.total);
          this.loaded.set(true);
        },
        error: (error) => {
          console.error('[GamesLibrary] Chargement impossible', error);
          this.error.set('Impossible de charger vos jeux.');
        },
      });

    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  sortValue(): string {
    const { sort = 'added', order } = this.query();
    return `${sort}-${order ?? (sort === 'title' ? 'asc' : 'desc')}`;
  }

  hasFilters(): boolean {
    const { q, region, genre, favorite } = this.query();
    return Boolean(q || region || genre || favorite);
  }

  subtitle(game: Game): string {
    return [game.serial, genreLabel(game.genre), game.year].filter(Boolean).join(' · ');
  }

  /** Waits for a pause in typing before changing the URL. */
  onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.setFilter('q', value.trim()), 300);
  }

  /** A changed filter is a new list: back to the first page. */
  setFilter(key: 'q' | 'region' | 'genre' | 'favorite', value: string): void {
    this.navigate({ [key]: value || null, page: null });
  }

  setSort(value: string): void {
    const option = SORTS.find((item) => item.value === value);
    if (!option) return;
    const isDefault = option.value === 'added-desc';
    this.navigate({
      sort: isDefault ? null : option.sort,
      order: isDefault ? null : option.order,
      page: null,
    });
  }

  /** mat-paginator is 0-based, the API is 1-based. */
  onPage(event: PageEvent): void {
    const sizeChanged = event.pageSize !== this.limit();
    this.navigate({
      page: sizeChanged || event.pageIndex === 0 ? null : event.pageIndex + 1,
      limit: event.pageSize === DEFAULT_LIMIT ? null : event.pageSize,
    });
  }

  toggleFavorite(game: Game): void {
    this.service.setFavorite(game.id, !game.favorite).subscribe({
      next: (updated) => {
        // In the favorites view, an un-favorited game leaves the list.
        if (this.query().favorite && !updated.favorite) {
          this.games.update((games) => games.filter((item) => item.id !== game.id));
          this.total.update((total) => total - 1);
        } else {
          this.games.update((games) => games.map((item) => (item.id === game.id ? updated : item)));
        }
      },
      error: (error) => {
        console.error('[GamesLibrary] Favori impossible', error);
        this.error.set('Impossible de modifier ce favori.');
      },
    });
  }

  add(): void {
    this.dialog
      .open<GameFormDialogComponent, void, Game>(GameFormDialogComponent)
      .afterClosed()
      .subscribe((created) => {
        // The new game may not match the filters or the sort: ask the backend again.
        if (!created) return;
        // Page 1 shows it first by default; otherwise changing the URL reloads.
        if (this.page() > 1) this.navigate({ page: null });
        else this.reload();
      });
  }

  private reload(): void {
    this.service.list(this.query()).subscribe((response) => {
      this.games.set(response.items);
      this.total.set(response.total);
    });
  }

  /** Merges into the current query string; null removes a parameter. */
  private navigate(params: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  /** Query-string values are untrusted: keep only the known ones. */
  private parse(raw: Record<string, string | null>): GameListQuery {
    const query: GameListQuery = {};
    if (raw['q']) query.q = raw['q'];
    if (REGIONS.some((item) => item.value === raw['region'])) query.region = raw['region'] as Region;
    if (GENRES.some((item) => item.value === raw['genre'])) query.genre = raw['genre'] as Genre;
    if (raw['favorite'] === 'true') query.favorite = true;
    if (['title', 'year', 'added'].includes(raw['sort'] ?? '')) query.sort = raw['sort'] as GameSort;
    if (raw['order'] === 'asc' || raw['order'] === 'desc') query.order = raw['order'];
    const page = Math.floor(Number(raw['page']));
    if (page > 1) query.page = page;
    const limit = Math.floor(Number(raw['limit']));
    if (limit >= 1 && limit <= 60) query.limit = limit;
    return query;
  }
}
