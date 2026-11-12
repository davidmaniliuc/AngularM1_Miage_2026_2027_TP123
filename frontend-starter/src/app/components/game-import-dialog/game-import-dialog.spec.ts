import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameImportDialogComponent } from './game-import-dialog';

describe('GameImportDialogComponent', () => {
  let httpMock: HttpTestingController;
  const close = vi.fn();

  beforeEach(() => {
    close.mockReset();
    TestBed.configureTestingModule({
      imports: [GameImportDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: { close } }],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  async function pick(files: File[]) {
    const fixture = TestBed.createComponent(GameImportDialogComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('[data-testid="disc-input"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('sends the picked .chd and closes with the created game', async () => {
    const fixture = await pick([new File(['MComprHD'], 'Suikoden.chd')]);
    expect(fixture.nativeElement.querySelector('[data-testid="disc-name"]').textContent).toContain('Suikoden.chd');

    (fixture.nativeElement.querySelector('[data-testid="import"]') as HTMLButtonElement).click();
    const req = httpMock.expectOne('/api/games/disc?name=Suikoden.chd');
    const game = { id: 'g1', title: 'Suikoden' };
    req.flush(game);

    expect(close).toHaveBeenCalledWith(game);
  });

  it('shows the reason a multi-file .cue is refused, before any upload', async () => {
    const cue = 'FILE "a.bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "b.bin" BINARY\n  TRACK 02 AUDIO\n';
    const fixture = await pick([new File([cue], 'game.cue'), new File(['x'], 'a.bin'), new File(['x'], 'b.bin')]);

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('.chd');
    expect((fixture.nativeElement.querySelector('[data-testid="import"]') as HTMLButtonElement).disabled).toBe(true);
    httpMock.expectNone('/api/games/disc');
  });

  it('shows the server message on a refusal', async () => {
    const fixture = await pick([new File(['x'], 'game.bin')]);
    (fixture.nativeElement.querySelector('[data-testid="import"]') as HTMLButtonElement).click();

    httpMock
      .expectOne('/api/games/disc?name=game.bin')
      .flush({ message: 'Image disque illisible', code: 'BAD_CUE' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Image disque illisible');
    expect(close).not.toHaveBeenCalled();
  });
});
