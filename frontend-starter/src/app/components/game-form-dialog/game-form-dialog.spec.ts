import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameFormDialogComponent } from './game-form-dialog';
import { Game } from '../../shared/models/game.model';

describe('GameFormDialogComponent', () => {
  let httpMock: HttpTestingController;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const game: Game = {
    id: 'g1',
    ownerId: 'u1',
    title: 'FF7',
    serial: 'SCUS-94163',
    genre: 'rpg',
    hasCover: true,
    createdAt: '2026-10-15T08:00:00.000Z',
  };

  function setup(data?: Game) {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GameFormDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data ?? null },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GameFormDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('does not send anything without a title', () => {
    const fixture = setup();
    fixture.componentInstance.save();
    httpMock.expectNone('/api/games');
    expect(fixture.componentInstance.form.controls.title.hasError('required')).toBe(true);
  });

  it('rejects a malformed serial', () => {
    const fixture = setup();
    fixture.componentInstance.form.patchValue({ title: 'X', serial: '12345' });
    fixture.componentInstance.save();
    httpMock.expectNone('/api/games');
    expect(fixture.componentInstance.form.controls.serial.hasError('pattern')).toBe(true);
  });

  it('creates a game and closes with it', () => {
    const fixture = setup();
    fixture.componentInstance.form.patchValue({ title: ' FF7 ', serial: 'scus-94163', genre: 'rpg' });
    fixture.componentInstance.save();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/games');
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('FF7');
    expect(body.get('serial')).toBe('SCUS-94163');
    expect(body.get('genre')).toBe('rpg');
    req.flush(game, { status: 201, statusText: 'Created' });

    expect(dialogRef.close).toHaveBeenCalledWith(game);
  });

  it('prefills the form and updates when editing', () => {
    const fixture = setup(game);
    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      title: 'FF7',
      serial: 'SCUS-94163',
      genre: 'rpg',
    });

    fixture.componentInstance.form.patchValue({ genre: 'course' });
    fixture.componentInstance.removeCover.setValue(true);
    fixture.componentInstance.save();

    const req = httpMock.expectOne((r) => r.method === 'PATCH' && r.url === '/api/games/g1');
    expect((req.request.body as FormData).get('genre')).toBe('course');
    expect((req.request.body as FormData).get('removeCover')).toBe('true');
    req.flush({ ...game, genre: 'course', hasCover: false });
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('refuses a cover that is not an image', () => {
    const fixture = setup();
    const file = new File(['x'], 'c.txt', { type: 'text/plain' });
    fixture.componentInstance.chooseCover({ target: { files: [file] } } as unknown as Event);
    expect(fixture.componentInstance.coverError()).toContain('JPEG, PNG ou WebP');
    expect(fixture.componentInstance.canSave()).toBe(false);
  });

  it('shows the server message on failure and stays open', () => {
    const fixture = setup();
    fixture.componentInstance.form.patchValue({ title: 'X' });
    fixture.componentInstance.save();
    httpMock
      .expectOne('/api/games')
      .flush({ message: 'Genre inconnu' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.serverError()).toBe('Genre inconnu');
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saving()).toBe(false);
  });
});
