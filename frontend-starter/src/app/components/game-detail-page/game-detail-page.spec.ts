import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameDetailPageComponent } from './game-detail-page';
import { GamesPageComponent } from '../games-page/games-page';

const game = { id: '1', title: 'Ridge Racer', ownerId: 'a', description: 'Racing', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
describe('Game detail', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([
      { path: 'games', component: GamesPageComponent },
      { path: 'games/:id', component: GameDetailPageComponent },
    ])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads metadata, keeps edits after failure, then displays saved metadata', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/games/1', GameDetailPageComponent);
    http.expectOne('/api/games/1').flush(game);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Ridge Racer');
    component.editing.set(true);
    component.save({ title: 'Edited' });
    const failed = http.expectOne({ method: 'PATCH', url: '/api/games/1' });
    expect(failed.request.body.title).toBe('Edited');
    failed.flush({}, { status: 500, statusText: 'Error' });
    expect(component.editing()).toBe(true);
    expect(component.game()?.title).toBe('Ridge Racer');
    component.save({ title: 'Edited' });
    http.expectOne({ method: 'PATCH', url: '/api/games/1' }).flush({ ...game, title: 'Edited' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Edited');
    expect(component.editing()).toBe(false);
  });

  it('reloads on a different game URL and hides missing records', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/1', GameDetailPageComponent);
    http.expectOne('/api/games/1').flush(game);
    await harness.navigateByUrl('/games/2', GameDetailPageComponent);
    http.expectOne('/api/games/2').flush({}, { status: 404, statusText: 'Not found' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Jeu introuvable');
    expect(harness.routeNativeElement?.textContent).not.toContain('Ridge Racer');
  });

  it('only deletes after confirmation and returns to the library', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/games/1', GameDetailPageComponent);
    http.expectOne('/api/games/1').flush(game);
    component.confirmDelete();
    const cancelled = TestBed.inject(MatDialog).openDialogs[0];
    const cancelClosed = firstValueFrom(cancelled.afterClosed());
    cancelled.close(false);
    await cancelClosed;
    http.expectNone({ method: 'DELETE', url: '/api/games/1' });
    component.confirmDelete();
    const confirmed = TestBed.inject(MatDialog).openDialogs[0];
    const confirmClosed = firstValueFrom(confirmed.afterClosed());
    confirmed.close(true);
    await confirmClosed;
    http.expectOne({ method: 'DELETE', url: '/api/games/1' }).flush(null);
    await new Promise(resolve => setTimeout(resolve, 0));
    http.expectOne('/api/games?page=1&limit=5&q=').flush({ items: [], total: 0, page: 1, limit: 5, pages: 1 });
    expect(TestBed.inject(Router).url).toBe('/games');
  });
});
