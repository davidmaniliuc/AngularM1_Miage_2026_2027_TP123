import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrackCoverComponent } from './track-cover';
import { Track } from '../../shared/models/track.model';

const base: Track = {
  id: 't1',
  title: 'Wither',
  originalName: 'wither.m4a',
  mimeType: 'audio/flac',
  size: 10,
  hasCover: true,
  createdAt: '2026-09-24T08:00:00.000Z',
};

describe('TrackCoverComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:cover-' + Math.random());
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      imports: [TrackCoverComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function create(track: Track) {
    const fixture = TestBed.createComponent(TrackCoverComponent);
    fixture.componentRef.setInput('track', track);
    fixture.detectChanges();
    return fixture;
  }

  it('does not call the API when the track has no cover', () => {
    const fixture = create({ ...base, hasCover: false });
    httpMock.expectNone('/api/tracks/t1/cover');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('loads the cover as a Blob and shows it as a decorative image', () => {
    const fixture = create(base);
    httpMock.expectOne('/api/tracks/t1/cover').flush(new Blob(['x'], { type: 'image/jpeg' }));
    fixture.detectChanges();

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toMatch(/^blob:cover-/);
    expect(img.getAttribute('alt')).toBe('');
  });

  it('revokes the ObjectURL when the track changes and when destroyed', () => {
    const fixture = create(base);
    httpMock.expectOne('/api/tracks/t1/cover').flush(new Blob(['x']));
    fixture.detectChanges();
    const first = fixture.nativeElement.querySelector('img').getAttribute('src');

    fixture.componentRef.setInput('track', { ...base, id: 't2' });
    fixture.detectChanges();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
    httpMock.expectOne('/api/tracks/t2/cover').flush(new Blob(['y']));
    fixture.detectChanges();
    const second = fixture.nativeElement.querySelector('img').getAttribute('src');

    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(second);
  });

  it('shows nothing (the format label stays visible) when loading fails', () => {
    const fixture = create(base);
    httpMock.expectOne('/api/tracks/t1/cover').flush(new Blob(), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
