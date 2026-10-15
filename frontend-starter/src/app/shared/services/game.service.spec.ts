import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameService } from './game.service';

describe('GameService', () => {
  let service: GameService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GameService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('creates a game with a multipart body including the cover', () => {
    const cover = new File(['x'], 'c.png', { type: 'image/png' });
    service.create({ title: 'FF7', serial: 'SCUS-94163', genre: 'rpg', cover }).subscribe();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/games');
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('FF7');
    expect(body.get('serial')).toBe('SCUS-94163');
    expect(body.get('genre')).toBe('rpg');
    expect(body.get('cover')).toBeInstanceOf(File);
    expect(body.has('removeCover')).toBe(false);
    req.flush({});
  });

  it('sends empty serial and genre on update so the API clears them', () => {
    service.update('g1', { title: 'FF7', serial: '', genre: '', removeCover: true }).subscribe();

    const req = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === '/api/games/g1');
    const body = req.request.body as FormData;
    expect(body.get('serial')).toBe('');
    expect(body.get('genre')).toBe('');
    expect(body.get('removeCover')).toBe('true');
    expect(body.has('cover')).toBe(false);
    req.flush({});
  });
});
