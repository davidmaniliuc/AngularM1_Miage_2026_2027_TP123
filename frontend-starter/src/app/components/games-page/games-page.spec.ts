import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GamesPageComponent } from './games-page';

const empty = { items: [], total: 0, page: 1, limit: 5, pages: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null };
describe('Private game library', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [GamesPageComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shows loading then an actionable empty library, and submits title search', () => {
    const fixture = TestBed.createComponent(GamesPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Chargement');
    http.expectOne('/api/games?page=1&limit=5&q=').flush(empty);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ajoutez votre premier jeu');
    fixture.componentInstance.search.setValue('Ridge');
    fixture.componentInstance.searchGames();
    const req = http.expectOne('/api/games?page=1&limit=5&q=Ridge');
    req.flush({ ...empty, total: 1, items: [{ id: '1', title: 'Ridge Racer', ownerId: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/games/1"]').textContent).toContain('Ridge Racer');
  });

  it('retains the create form after an error, then refreshes after saving', () => {
    const fixture = TestBed.createComponent(GamesPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/games?page=1&limit=5&q=').flush(empty);
    fixture.componentInstance.creating.set(true);
    fixture.componentInstance.create({ title: 'Demo' });
    http.expectOne({ method: 'POST', url: '/api/games' }).flush({ message: 'Échec du serveur' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.creating()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Échec du serveur');
    fixture.componentInstance.create({ title: 'Demo' });
    http.expectOne({ method: 'POST', url: '/api/games' }).flush({ id: '1', title: 'Demo' });
    http.expectOne('/api/games?page=1&limit=5&q=').flush(empty);
    expect(fixture.componentInstance.creating()).toBe(false);
  });

  it('displays load failure with a working retry', () => {
    const fixture = TestBed.createComponent(GamesPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/games?page=1&limit=5&q=').flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Impossible de charger');
    fixture.componentInstance.load();
    http.expectOne('/api/games?page=1&limit=5&q=').flush(empty);
    expect(fixture.componentInstance.error()).toBe('');
  });

  it('keeps the empty-state tied to the submitted search until searching again', () => {
    const fixture = TestBed.createComponent(GamesPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/games?page=1&limit=5&q=').flush(empty);
    fixture.componentInstance.search.setValue('No match');
    fixture.componentInstance.searchGames();
    http.expectOne('/api/games?page=1&limit=5&q=No%20match').flush(empty);
    fixture.componentInstance.search.setValue('');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aucun jeu trouvé');
    expect(fixture.nativeElement.textContent).not.toContain('Ajoutez votre premier jeu');
  });
});
