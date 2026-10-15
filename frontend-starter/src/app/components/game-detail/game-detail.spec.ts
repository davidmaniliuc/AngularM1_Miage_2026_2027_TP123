import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameDetailComponent } from './game-detail';
import { Game } from '../../shared/models/game.model';

describe('GameDetailComponent', () => {
  let httpMock: HttpTestingController;

  const game: Game = {
    id: 'g1',
    ownerId: 'u1',
    title: 'Final Fantasy VII',
    serial: 'SCUS-94163',
    genre: 'rpg',
    hasCover: false,
    createdAt: '2026-10-15T08:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GameDetailComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'g1']]) } } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shows the title, serial and genre label', () => {
    const fixture = TestBed.createComponent(GameDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/games/g1').flush(game);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Final Fantasy VII');
    expect(element.querySelector('[data-testid="serial"]')?.textContent).toContain('SCUS-94163');
    expect(element.querySelector('[data-testid="genre"]')?.textContent).toContain('RPG');
  });

  it('uses the default image when the game has no cover', () => {
    const fixture = TestBed.createComponent(GameDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/games/g1').flush(game);
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('app-game-cover img');
    expect(img?.getAttribute('src')).toBe('/game-placeholder.svg');
    httpMock.expectNone('/api/games/g1/cover');
  });

  it('fetches and shows the cover when there is one', () => {
    const fixture = TestBed.createComponent(GameDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/games/g1').flush({ ...game, hasCover: true });
    fixture.detectChanges();
    httpMock.expectOne('/api/games/g1/cover').flush(new Blob(['x'], { type: 'image/png' }));
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('app-game-cover img');
    expect(img?.getAttribute('src')).toMatch(/^blob:/);
  });

  it('shows an error when the game is unknown', () => {
    const fixture = TestBed.createComponent(GameDetailComponent);
    fixture.detectChanges();
    httpMock.expectOne('/api/games/g1').flush({ message: 'Jeu inconnu' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Jeu introuvable');
  });
});
