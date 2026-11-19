import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GamesLibraryComponent } from './games-library';
import { Game } from '../../shared/models/game.model';
import { Page } from '../../shared/models/page.model';

describe('GamesLibraryComponent', () => {
  let httpMock: HttpTestingController;

  const game: Game = {
    id: 'g1',
    ownerId: 'u1',
    title: 'Crash Bandicoot',
    serial: 'SCUS-94900',
    genre: 'plateforme',
    year: 1996,
    favorite: false,
    hasCover: false,
    createdAt: '2026-10-15T08:00:00.000Z',
  };

  const page = (items: Game[], total = items.length): Page<Game> => ({
    items,
    page: 1,
    limit: 24,
    total,
    pages: 1,
    pagingCounter: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
  });

  async function open(url = '/games') {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url, GamesLibraryComponent);
    return { harness, navigation };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'games', component: GamesLibraryComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists games with serial, genre and year, linking to their sheet', async () => {
    const { harness, navigation } = await open();
    await navigation;
    httpMock.expectOne((r) => r.url === '/api/games').flush(page([game]));
    harness.detectChanges();

    const link = (harness.routeNativeElement as HTMLElement).querySelector('[data-testid="game-link"]');
    expect(link?.textContent).toContain('Crash Bandicoot');
    expect(link?.textContent).toContain('SCUS-94900 · Plateforme · 1996');
    expect(link?.getAttribute('href')).toBe('/games/g1');
  });

  it('says so when there is no game', async () => {
    const { harness, navigation } = await open();
    await navigation;
    httpMock.expectOne((r) => r.url === '/api/games').flush(page([]));
    harness.detectChanges();

    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Aucun jeu pour');
  });

  it('reads the filters from the URL and sends them to the API', async () => {
    const { navigation } = await open('/games?genre=rpg&region=pal&favorite=true&sort=title&order=asc&page=2&limit=12&q=ff');
    await navigation;

    const req = httpMock.expectOne((r) => r.url === '/api/games');
    expect(req.request.params.get('genre')).toBe('rpg');
    expect(req.request.params.get('region')).toBe('pal');
    expect(req.request.params.get('favorite')).toBe('true');
    expect(req.request.params.get('sort')).toBe('title');
    expect(req.request.params.get('order')).toBe('asc');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('12');
    expect(req.request.params.get('q')).toBe('ff');
    req.flush(page([]));
  });

  it('ignores unknown values in the URL', async () => {
    const { navigation } = await open('/games?genre=nimporte&region=mars&sort=xxx&page=-3');
    await navigation;

    const req = httpMock.expectOne((r) => r.url === '/api/games');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(page([]));
  });

  it('puts a changed filter in the URL and goes back to page 1', async () => {
    const { harness, navigation } = await open('/games?page=3');
    await navigation;
    httpMock.expectOne((r) => r.url === '/api/games').flush(page([game], 80));
    harness.detectChanges();

    const root = harness.routeNativeElement as HTMLElement;
    root.querySelector<HTMLElement>('[data-testid="genre"] .mat-mdc-select-trigger')!.click();
    harness.detectChanges();
    const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find((o) => o.textContent?.includes('RPG'))!;
    option.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/games?genre=rpg');
    const req = httpMock.expectOne((r) => r.url === '/api/games');
    expect(req.request.params.get('genre')).toBe('rpg');
    expect(req.request.params.has('page')).toBe(false);
    req.flush(page([]));
  });

  it('toggles a favorite from the grid', async () => {
    const { harness, navigation } = await open();
    await navigation;
    httpMock.expectOne((r) => r.url === '/api/games').flush(page([game]));
    harness.detectChanges();

    (harness.routeNativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="favorite"]')!.click();
    const req = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === '/api/games/g1');
    expect((req.request.body as FormData).get('favorite')).toBe('true');
    req.flush({ ...game, favorite: true });
    harness.detectChanges();

    const button = (harness.routeNativeElement as HTMLElement).querySelector('[data-testid="favorite"]');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
  });
});
