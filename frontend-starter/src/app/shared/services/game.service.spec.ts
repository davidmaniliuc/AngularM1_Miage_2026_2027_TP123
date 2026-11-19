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
    service.create({ title: 'FF7', serial: 'SCUS-94163', genre: 'rpg', region: 'pal', year: '1997', cover }).subscribe();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/games');
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('FF7');
    expect(body.get('serial')).toBe('SCUS-94163');
    expect(body.get('genre')).toBe('rpg');
    expect(body.get('region')).toBe('pal');
    expect(body.get('year')).toBe('1997');
    expect(body.get('cover')).toBeInstanceOf(File);
    expect(body.has('removeCover')).toBe(false);
    req.flush({});
  });

  it('sends empty serial and genre on update so the API clears them', () => {
    service.update('g1', { title: 'FF7', serial: '', genre: '', region: '', year: '', removeCover: true }).subscribe();

    const req = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === '/api/games/g1');
    const body = req.request.body as FormData;
    expect(body.get('serial')).toBe('');
    expect(body.get('genre')).toBe('');
    expect(body.get('removeCover')).toBe('true');
    expect(body.has('cover')).toBe(false);
    req.flush({});
  });

  it('sends only the set filters of the list query as URL parameters', () => {
    service.list({ q: 'crash', genre: 'rpg', favorite: true, sort: 'title', order: 'asc', page: 2 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/games');
    expect(req.request.params.get('q')).toBe('crash');
    expect(req.request.params.get('genre')).toBe('rpg');
    expect(req.request.params.get('favorite')).toBe('true');
    expect(req.request.params.get('sort')).toBe('title');
    expect(req.request.params.get('order')).toBe('asc');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.has('region')).toBe(false);
    req.flush({ items: [] });
  });

  it('patches only the favorite flag', () => {
    service.setFavorite('g1', true).subscribe();

    const req = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === '/api/games/g1');
    const body = req.request.body as FormData;
    expect(body.get('favorite')).toBe('true');
    expect(body.has('title')).toBe(false);
    req.flush({});
  });

  it('sends a disc as the raw body, with its name and its .cue in base64', () => {
    const file = new File(['disc'], 'Crash Bandicoot.bin');
    const cue = 'FILE "Crash Bandicoot.bin" BINARY\n  TRACK 01 MODE2/2352 — é\n';
    service.importDisc(file, cue).subscribe();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/games/disc');
    expect(req.request.body).toBe(file);
    expect(req.request.params.get('name')).toBe('Crash Bandicoot.bin');
    expect(req.request.reportProgress).toBe(true);
    const encoded = req.request.headers.get('X-Cue') ?? '';
    expect(new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))).toBe(cue);
    req.flush({});
  });

  it('sends a .chd without X-Cue', () => {
    service.importDisc(new File(['MComprHD'], 'game.chd')).subscribe();

    const req = httpMock.expectOne('/api/games/disc?name=game.chd');
    expect(req.request.headers.has('X-Cue')).toBe(false);
    req.flush({});
  });
});
