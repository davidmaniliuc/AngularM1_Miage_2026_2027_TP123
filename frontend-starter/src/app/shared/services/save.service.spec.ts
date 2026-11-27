import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SaveService } from './save.service';

describe('SaveService', () => {
  let service: SaveService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SaveService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('returns the saved bytes', () => {
    let result: Uint8Array | undefined;
    service.load('g1', 'state').subscribe((bytes) => (result = bytes));

    httpMock.expectOne('/api/games/g1/saves/state').flush(new Uint8Array([1, 2, 3]).buffer);
    expect(Array.from(result ?? [])).toEqual([1, 2, 3]);
  });

  it('returns undefined when the game has no save yet (404)', () => {
    let result: Uint8Array | undefined | 'unset' = 'unset';
    service.load('g1', 'memcard').subscribe((bytes) => (result = bytes));

    httpMock.expectOne('/api/games/g1/saves/memcard').flush(null, { status: 404, statusText: 'Not Found' });
    expect(result).toBeUndefined();
  });

  it('lets other errors through', () => {
    let status = 0;
    service.load('g1', 'state').subscribe({ error: (error) => (status = error.status) });

    httpMock.expectOne('/api/games/g1/saves/state').flush(null, { status: 500, statusText: 'Server Error' });
    expect(status).toBe(500);
  });

  it('sends the raw bytes with PUT', () => {
    service.save('g1', 'memcard', new Uint8Array([9, 9])).subscribe();

    const req = httpMock.expectOne('/api/games/g1/saves/memcard');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBeInstanceOf(Blob);
    expect((req.request.body as Blob).size).toBe(2);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
