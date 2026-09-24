import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadDialogComponent } from './upload-dialog';
import { Track } from '../../shared/models/track.model';
import { MAX_AUDIO_SIZE } from '../../shared/utils/audio-file';

describe('UploadDialogComponent', () => {
  let httpMock: HttpTestingController;
  let dialogRef: { close: ReturnType<typeof vi.fn>; disableClose: boolean };

  const created: Track = {
    id: 't9',
    title: 'Mon solo',
    originalName: 'song.mp3',
    mimeType: 'audio/mpeg',
    size: 5,
    hasCover: false,
    createdAt: '2026-09-24T08:00:00.000Z',
  };

  beforeEach(() => {
    dialogRef = { close: vi.fn(), disableClose: false };
    TestBed.configureTestingModule({
      imports: [UploadDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialogRef, useValue: dialogRef }],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function create() {
    const fixture = TestBed.createComponent(UploadDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  function selectFile(fixture: ReturnType<typeof create>, file: File) {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  const mp3 = () => new File(['audio'], 'song.mp3', { type: 'audio/mpeg' });
  const submit = (fixture: ReturnType<typeof create>) =>
    fixture.nativeElement.querySelector('[data-test="upload"]') as HTMLButtonElement;

  it('enables "Importer" only once a valid file is chosen', () => {
    const fixture = create();
    expect(submit(fixture).disabled).toBe(true);
    selectFile(fixture, mp3());
    expect(submit(fixture).disabled).toBe(false);
  });

  it('refuses a non-audio file before any HTTP call', () => {
    const fixture = create();
    selectFile(fixture, new File(['x'], 'photo.png', { type: 'image/png' }));
    fixture.componentInstance.upload();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.method === 'POST');
    expect(submit(fixture).disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Format non accepté');
  });

  it('refuses a file larger than 100 Mo before any HTTP call', () => {
    const fixture = create();
    const big = mp3();
    Object.defineProperty(big, 'size', { value: MAX_AUDIO_SIZE + 1 });
    selectFile(fixture, big);
    fixture.componentInstance.upload();
    fixture.detectChanges();

    httpMock.expectNone((r) => r.method === 'POST');
    expect(fixture.nativeElement.textContent).toContain('100 Mo');
  });

  it('sends multipart audio + title, shows progress, blocks double submit and closes with the track', () => {
    const fixture = create();
    fixture.componentInstance.title.setValue('Mon solo');
    selectFile(fixture, mp3());

    fixture.componentInstance.upload();
    fixture.componentInstance.upload();
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.method === 'POST' && r.url === '/api/tracks');
    const body = req.request.body as FormData;
    expect((body.get('audio') as File).name).toBe('song.mp3');
    expect(body.get('title')).toBe('Mon solo');
    expect(fixture.componentInstance.uploading()).toBe(true);
    expect(dialogRef.disableClose).toBe(true);
    expect(submit(fixture).disabled).toBe(true);

    req.event({ type: HttpEventType.UploadProgress, loaded: 32, total: 50 });
    fixture.detectChanges();
    expect(fixture.componentInstance.progress()).toBe(64);
    expect(fixture.nativeElement.querySelector('mat-progress-bar')).not.toBeNull();

    req.flush(created, { status: 201, statusText: 'Created' });
    expect(dialogRef.close).toHaveBeenCalledWith(created);
  });

  it('sends an empty title when none is typed, so the backend can use the file tag', () => {
    const fixture = create();
    selectFile(fixture, mp3());
    fixture.componentInstance.upload();

    const req = httpMock.expectOne((r) => r.method === 'POST');
    expect((req.request.body as FormData).get('title')).toBe('');
    req.flush(created);
  });

  it('accepts .flac in the file picker', () => {
    const fixture = create();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="file"]');
    expect(input.accept).toContain('.flac');
  });

  it('shows the server error and allows a new attempt', () => {
    const fixture = create();
    selectFile(fixture, mp3());
    fixture.componentInstance.upload();

    httpMock
      .expectOne((r) => r.method === 'POST')
      .flush({ message: 'Format audio non accepté' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(fixture.componentInstance.uploading()).toBe(false);
    expect(dialogRef.disableClose).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Format audio non accepté');
    expect(submit(fixture).disabled).toBe(false);
  });
});
