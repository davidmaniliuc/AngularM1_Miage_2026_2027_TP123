import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GamesLibraryComponent } from './games-library';
import { Game } from '../../shared/models/game.model';

describe('GamesLibraryComponent', () => {
  let httpMock: HttpTestingController;

  const game: Game = {
    id: 'g1',
    ownerId: 'u1',
    title: 'Crash Bandicoot',
    serial: 'SCUS-94900',
    genre: 'plateforme',
    hasCover: false,
    createdAt: '2026-10-15T08:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GamesLibraryComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists games with serial and genre, linking to their sheet', () => {
    const fixture = TestBed.createComponent(GamesLibraryComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/games').flush([game]);
    fixture.detectChanges();

    const link = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="game-link"]');
    expect(link?.textContent).toContain('Crash Bandicoot');
    expect(link?.textContent).toContain('SCUS-94900 · Plateforme');
    expect(link?.getAttribute('href')).toBe('/games/g1');
  });

  it('says so when there is no game', () => {
    const fixture = TestBed.createComponent(GamesLibraryComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/games').flush([]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aucun jeu');
  });
});
