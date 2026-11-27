import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
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
import { CompatBadgeComponent } from '../compat-badge/compat-badge';
import { GameCoverComponent } from '../game-cover/game-cover';
import { GameFormDialogComponent } from '../game-form-dialog/game-form-dialog';
import { GameImportDialogComponent } from '../game-import-dialog/game-import-dialog';
import { GamesPaginatorIntl } from '../../shared/i18n/french-paginator-intl';

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
    MatProgressBarModule,
    MatSelectModule,
    CompatBadgeComponent,
    GameCoverComponent,
  ],
  providers: [{ provide: MatPaginatorIntl, useClass: GamesPaginatorIntl }],
  template: `
    <div class="head">
      <div class="actions">
        <button mat-stroked-button type="button" data-testid="add-game" (click)="add()">
          <mat-icon>edit</mat-icon>Saisir à la main
        </button>
        <button mat-flat-button type="button" data-testid="import-game" (click)="importDisc()">
          <mat-icon>album</mat-icon>Importer un jeu
        </button>
      </div>
    </div>

    <div class="filters">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          type="search"
          placeholder="Titre ou numéro de série"
          aria-label="Rechercher un jeu"
          data-testid="search"
          [value]="query().q ?? ''"
          (input)="onSearch($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-select data-testid="region" aria-label="Région" [value]="query().region ?? ''" (selectionChange)="setFilter('region', $event.value)">
          <mat-option value="">Toutes les régions</mat-option>
          @for (region of regions; track region.value) {
            <mat-option [value]="region.value">{{ region.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-select data-testid="genre" aria-label="Genre" [value]="query().genre ?? ''" (selectionChange)="setFilter('genre', $event.value)">
          <mat-option value="">Tous les genres</mat-option>
          @for (genre of genres; track genre.value) {
            <mat-option [value]="genre.value">{{ genre.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-select data-testid="sort" aria-label="Trier par" [value]="sortValue()" (selectionChange)="setSort($event.value)">
          @for (option of sorts; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button
        type="button"
        class="fav-filter"
        data-testid="favorites-filter"
        [class.selected]="query().favorite"
        [attr.aria-pressed]="!!query().favorite"
        (click)="setFilter('favorite', query().favorite ? '' : 'true')"
      >
        <mat-icon [class.icon-fill]="query().favorite">favorite</mat-icon>Favoris
      </button>
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" class="loading" aria-label="Chargement des jeux" />
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (loaded() && games().length === 0) {
      <div class="empty">
        @if (hasFilters()) {
          <mat-icon>search_off</mat-icon>
          <h2>Aucun jeu ne correspond à ces filtres</h2>
          <button mat-button type="button" (click)="clearFilters()">Effacer les filtres</button>
        } @else {
          <span class="ring"><mat-icon>album</mat-icon></span>
          <h2>Aucun jeu pour l'instant</h2>
          <p>Importez le fichier d'un disque (.chd, .cue ou .bin) : le titre, la région et le numéro de série sont lus sur le disque.</p>
          <button mat-flat-button type="button" (click)="importDisc()"><mat-icon>album</mat-icon>Importer un jeu</button>
        }
      </div>
    }

    <ul class="games" [attr.aria-busy]="loading()">
      @for (game of games(); track game.id) {
        <li>
          <a [routerLink]="['/games', game.id]" data-testid="game-link">
            <!-- Le boîtier : le numéro de série est imprimé sur le dos. -->
            <span class="shelf">
              <!-- Le disque sort du boîtier au survol. -->
              <span class="disc" aria-hidden="true"></span>
              <span class="case">
                <span class="spine" aria-hidden="true">
                  <span class="serial">{{ game.serial || 'PS1' }}</span>
                  @if (game.region) { <span class="region">{{ regionCode(game.region) }}</span> }
                </span>
                <app-game-cover [game]="game" />
              </span>
            </span>
            <b>{{ game.title }}</b>
            <small>{{ subtitle(game) }}</small>
            <app-compat-badge [compat]="game.compat" />
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

    <!-- Below the smallest page size there is only one page: no paginator. -->
    @if (total() > pageSizes[0]) {
      <mat-paginator
        [length]="total()"
        [pageIndex]="page() - 1"
        [pageSize]="limit()"
        [pageSizeOptions]="pageSizes"
        (page)="onPage($event)"
        aria-label="Pagination des jeux"
      />
    }
  `,
  styles: `
    :host { display: block; container-type: inline-size; }

    .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 12px; margin-bottom: 14px; }
    .actions { display: flex; gap: 8px; }
    .actions button { height: 40px; }

    .filters { display: grid; grid-template-columns: minmax(200px, 1fr) repeat(3, 196px) auto; gap: 8px; margin-bottom: 32px; }
    .filters mat-form-field {
      --mat-form-field-container-height: 40px;
      --mat-form-field-container-vertical-padding: 8px;
      --mat-form-field-container-text-size: 14px;
      --mat-select-trigger-text-size: 14px;
      --mat-form-field-outlined-focus-outline-width: 1px;
      border-radius: 3px;
      background: var(--gpc-inlay);
    }
    .search mat-icon { color: var(--gpc-ink-soft); }
    .filters .mat-mdc-select-value { padding-right: 8px; }
    .fav-filter {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 40px;
      padding: 0 14px 0 10px;
      border: 1px solid var(--gpc-edge-control);
      border-radius: 3px;
      background: var(--gpc-inlay);
      color: var(--gpc-ink-soft);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }
    .fav-filter:hover { border-color: var(--gpc-ink); color: var(--gpc-ink); }
    .fav-filter mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .fav-filter.selected { border-color: var(--gpc-ink); background: var(--gpc-ink); color: var(--mat-sys-on-primary); }
    .fav-filter.selected mat-icon { color: var(--gpc-ps-circle); }

    .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 32px 26px; margin: 0; padding: 0; list-style: none; }
    li { position: relative; }
    /* Le disque sorti passe au-dessus du boîtier voisin. */
    li:has(a:hover, a:focus-visible) { z-index: 1; }
    a { display: grid; gap: 3px; color: var(--gpc-ink); text-decoration: none; }
    a b { margin-top: 10px; font-size: 15px; font-weight: 600; line-height: 1.25; text-wrap: balance; }
    a small { font: 12px/1.4 var(--gpc-mono); color: var(--gpc-ink-soft); font-variant-numeric: tabular-nums; }

    /* Boîtier : dos noir à gauche, jaquette carrée, reflet du plastique. */
    .case {
      position: relative;
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      border: 1px solid var(--gpc-edge);
      border-radius: 2px;
      background: var(--gpc-inlay);
      box-shadow: 0 10px 18px -12px #000a;
      transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s cubic-bezier(0.16, 1, 0.3, 1);
    }
    /* Disque PS1 : face noire, reflet arc-en-ciel, rangé derrière la jaquette. */
    .shelf { position: relative; display: block; }
    .disc {
      position: absolute;
      top: 7%;
      left: 14%;
      height: 86%;
      aspect-ratio: 1;
      border-radius: 50%;
      background:
        radial-gradient(circle, var(--gpc-case) 0 9%, #3a3b40 9.5% 11%, #0b0b0c 11.5% 30%, #1d1e22 30.5% 31.5%, transparent 32%),
        conic-gradient(from 200deg, #0b0b0c, #3a1d4d 8%, #0b0b0c 16%, #123a52 26%, #0b0b0c 34%, #4a3a12 44%, #0b0b0c 52%, #12402c 62%, #0b0b0c 70%, #4d1a2c 82%, #0b0b0c);
      box-shadow: 0 8px 18px -10px #000c, 0 0 0 1px var(--gpc-edge);
      transition: translate 0.55s cubic-bezier(0.16, 1, 0.3, 1), rotate 0.9s cubic-bezier(0.16, 1, 0.3, 1);
    }
    a:hover .disc, a:focus-visible .disc { translate: 42% 0; rotate: 160deg; }
    .case::after {
      content: '';
      position: absolute;
      inset: 0 0 0 22px;
      background: linear-gradient(115deg, #ffffff4d 0, #ffffff14 24%, transparent 36%);
      box-shadow: inset 0 1px 0 #ffffff59;
      pointer-events: none;
    }
    a:hover .case, a:focus-visible .case { transform: translateY(-6px) rotate(-1.5deg); box-shadow: 0 26px 30px -16px #000b; }
    .spine {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      background: var(--gpc-spine);
      color: var(--gpc-spine-ink);
      border-right: 1px solid #2a2a2e;
    }
    .spine span { writing-mode: vertical-rl; transform: rotate(180deg); font: 500 9.5px/1 var(--gpc-mono); letter-spacing: 0.12em; white-space: nowrap; }
    .spine .region { color: var(--gpc-spine-ink-soft); }
    app-game-cover { margin: 3px; }

    /* 44px de zone cliquable autour du disque de 30px. */
    .fav { position: absolute; top: 0; right: 0; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; background: none; color: #fff; cursor: pointer; }
    .fav::before { content: ''; position: absolute; inset: 7px; border-radius: 50%; background: #0b0b0ccc; }
    .fav mat-icon { position: relative; font-size: 18px; width: 18px; height: 18px; }
    .fav[aria-pressed='true'] mat-icon { color: var(--gpc-ps-circle); }

    .empty {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 48px 20px;
      border: 1.5px dashed var(--gpc-edge);
      border-radius: 3px;
      text-align: center;
    }
    .empty h2 { margin: 8px 0 0; font-size: 18px; font-weight: 700; }
    .empty p { max-width: 46ch; margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: var(--gpc-ink-soft); }
    .empty > mat-icon { font-size: 32px; width: 32px; height: 32px; color: var(--gpc-ink-soft); }
    .ring { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--gpc-spine); color: var(--gpc-spine-ink); box-shadow: inset 0 0 0 22px var(--gpc-spine), inset 0 0 0 24px #44464d; }
    .ring mat-icon { font-size: 26px; width: 26px; height: 26px; }
    .error { color: var(--mat-sys-error); }
    .loading { margin: -20px 0 16px; }

    mat-paginator { margin-top: 24px; }

    @media (prefers-reduced-motion: reduce) {
      .case, .disc { transition: none; }
      a:hover .case, a:focus-visible .case { transform: none; }
      a:hover .disc, a:focus-visible .disc { rotate: none; }
    }

    @container (max-width: 820px) {
      .filters { grid-template-columns: 1fr 1fr; }
      .filters .search { grid-column: 1 / -1; }
    }
    @container (max-width: 480px) {
      .games { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 14px; }
      .actions { width: 100%; }
      .actions button { flex: 1; }
    }
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
  readonly pageSizes = [12, 24, 48];

  readonly games = signal<Game[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(true);
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
          this.loading.set(true);
        }),
        switchMap(() => this.service.list(this.query())),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (response) => {
          this.games.set(response.items);
          this.total.set(response.total);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: (error) => {
          console.error('[GamesLibrary] Chargement impossible', error);
          this.loading.set(false);
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

  /** Region as printed on a case spine: NTSC-U, NTSC-J, PAL. */
  regionCode(region: string): string {
    return region.toUpperCase();
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

  clearFilters(): void {
    this.navigate({ q: null, region: null, genre: null, favorite: null, page: null });
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

  /** A game created from its disc opens on its sheet, filled by the backend. */
  importDisc(): void {
    this.dialog
      .open<GameImportDialogComponent, void, Game>(GameImportDialogComponent)
      .afterClosed()
      .subscribe((created) => {
        if (created) void this.router.navigate(['/games', created.id]);
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
