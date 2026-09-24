import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TracksPageComponent } from './tracks-page';
import { Track } from '../../shared/models/track.model';
import { Page } from '../../shared/models/page.model';
import { FrenchPaginatorIntl } from '../../shared/i18n/french-paginator-intl';

const track: Track = {
  id: 't1',
  title: 'Blues en La',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 10_313_062,
  hasCover: false,
  createdAt: '2026-09-01T10:00:00.000Z',
};
const other: Track = { ...track, id: 't2', title: 'Funk en Mi', originalName: 'funk.wav', mimeType: 'audio/wav' };

const pageOf = (page: number, pages: number, items: Track[] = [track], limit = 5): Page<Track> => ({
  items,
  page,
  limit,
  total: pages * limit,
  pages,
  pagingCounter: (page - 1) * limit + 1,
  hasPrevPage: page > 1,
  hasNextPage: page < pages,
  prevPage: page > 1 ? page - 1 : null,
  nextPage: page < pages ? page + 1 : null,
});

describe('TracksPageComponent', () => {
  let httpMock: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatPaginatorIntl, useClass: FrenchPaginatorIntl },
        { provide: MatDialog, useValue: { open: dialogOpen } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    URL.createObjectURL = vi.fn(() => 'blob:fake-' + Math.random());
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => httpMock.verify());

  const listRequest = () => httpMock.expectOne((r) => r.url === '/api/tracks' && r.method === 'GET');

  function create(response: Page<Track> = pageOf(1, 2)) {
    const fixture = TestBed.createComponent(TracksPageComponent);
    fixture.detectChanges();
    listRequest().flush(response);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ReturnType<typeof create>): HTMLElement => fixture.nativeElement;

  describe('pagination serveur (mat-paginator)', () => {
    it('requests page=1&limit=5 on creation', () => {
      TestBed.createComponent(TracksPageComponent).detectChanges();
      const req = listRequest();
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('limit')).toBe('5');
      req.flush(pageOf(1, 1));
    });

    it('sends a new request with page=2 when clicking the next page button', () => {
      const fixture = create(pageOf(1, 3));
      el(fixture).querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();

      const req = listRequest();
      expect(req.request.params.get('page')).toBe('2');
      req.flush(pageOf(2, 3));
      fixture.detectChanges();

      expect(fixture.componentInstance.page()).toBe(2);
      expect(el(fixture).textContent).toContain('6 à 10 sur 15');
    });

    it('converts the 0-based paginator event into the 1-based API page, with the chosen size', () => {
      const fixture = create();
      fixture.componentInstance.onPage({ pageIndex: 0, pageSize: 10, length: 10 });
      const req = listRequest();
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('limit')).toBe('10');
      req.flush(pageOf(1, 1, [track], 10));
    });

    it('disables previous on the first page and next on the last page', () => {
      const fixture = create(pageOf(1, 1));
      // mat-paginator uses `disabledInteractive`: aria-disabled instead of the disabled attribute.
      expect(el(fixture).querySelector('.mat-mdc-paginator-navigation-previous')!.getAttribute('aria-disabled')).toBe('true');
      expect(el(fixture).querySelector('.mat-mdc-paginator-navigation-next')!.getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('états de la liste', () => {
    it('shows the empty state with an import action', () => {
      const fixture = create(pageOf(1, 1, []));
      expect(el(fixture).textContent).toContain('Aucune piste');
    });

    it('shows an error with a retry action when the list cannot be loaded', () => {
      const fixture = TestBed.createComponent(TracksPageComponent);
      fixture.detectChanges();
      listRequest().flush({ message: 'Erreur serveur' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.error()).toBe('Erreur serveur');
      expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
    });

    it('renders one card per track with readable size and format', () => {
      const fixture = create(pageOf(1, 1, [track, other]));
      expect(el(fixture).querySelectorAll('app-track-card').length).toBe(2);
      expect(el(fixture).textContent).toContain('9,8 Mo');
      expect(el(fixture).textContent).toContain('WAV');
    });

    it('filters the displayed page by title without any HTTP call', () => {
      const fixture = create(pageOf(1, 1, [track, other]));
      fixture.componentInstance.filter.set('funk');
      fixture.detectChanges();
      expect(el(fixture).querySelectorAll('app-track-card').length).toBe(1);
    });
  });

  describe('import', () => {
    it('opens the upload dialog', () => {
      dialogOpen.mockReturnValue({ afterClosed: () => of(undefined) });
      const fixture = create();
      el(fixture).querySelector<HTMLButtonElement>('button.import')!.click();
      expect(dialogOpen).toHaveBeenCalled();
    });

    it('reloads the first page after a successful upload', () => {
      dialogOpen.mockReturnValue({ afterClosed: () => of(other) });
      const fixture = create(pageOf(1, 2));
      fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 5, length: 10 });
      listRequest().flush(pageOf(2, 2));

      fixture.componentInstance.openUpload();

      const reload = listRequest();
      expect(reload.request.params.get('page')).toBe('1');
      reload.flush(pageOf(1, 2, [other, track]));
    });
  });

  describe('lecture authentifiée', () => {
    it('plays a track, shows it as current and revokes the previous and the final ObjectURL', () => {
      const fixture = create();
      fixture.componentInstance.play(track);
      httpMock.expectOne('/api/tracks/t1/audio').flush(new Blob(['a'], { type: 'audio/mpeg' }));
      fixture.detectChanges();

      const firstUrl = fixture.componentInstance.audioUrl();
      expect(firstUrl).toMatch(/^blob:/);
      expect(el(fixture).querySelector('app-audio-player')!.textContent).toContain('En cours');

      fixture.componentInstance.play(other);
      httpMock.expectOne('/api/tracks/t2/audio').flush(new Blob(['b'], { type: 'audio/wav' }));
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);

      const finalUrl = fixture.componentInstance.audioUrl();
      fixture.destroy();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(finalUrl);
    });

    it('does not download the Blob again when the current track is clicked', () => {
      const fixture = create();
      fixture.componentInstance.play(track);
      httpMock.expectOne('/api/tracks/t1/audio').flush(new Blob(['a']));
      fixture.detectChanges();

      fixture.componentInstance.play(track);
      httpMock.expectNone('/api/tracks/t1/audio');
    });

    it('explains a 404 on the audio request', () => {
      const fixture = create();
      fixture.componentInstance.play(track);
      httpMock
        .expectOne('/api/tracks/t1/audio')
        .flush(new Blob(['{"message":"Piste inconnue"}']), { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(fixture.componentInstance.audioError()).toContain('introuvable');
      expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
    });

    it('explains a file the browser cannot decode', () => {
      const fixture = create();
      fixture.componentInstance.play(track);
      httpMock.expectOne('/api/tracks/t1/audio').flush(new Blob(['a']));
      fixture.detectChanges();

      el(fixture).querySelector('audio')!.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(fixture.componentInstance.audioError()).toContain('lire ce fichier');
    });
  });

  describe('suppression', () => {
    it('deletes after confirmation, stops the current track and reloads', () => {
      dialogOpen.mockReturnValue({ afterClosed: () => of(true) });
      const fixture = create();
      fixture.componentInstance.play(track);
      httpMock.expectOne('/api/tracks/t1/audio').flush(new Blob(['a']));
      const url = fixture.componentInstance.audioUrl();

      fixture.componentInstance.confirmRemove(track);
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url === '/api/tracks/t1')
        .flush(null, { status: 204, statusText: 'No Content' });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
      expect(fixture.componentInstance.currentTrack()).toBeUndefined();
      listRequest().flush(pageOf(1, 1, []));
    });

    it('goes back to the last existing page when the current page became empty', () => {
      dialogOpen.mockReturnValue({ afterClosed: () => of(true) });
      const fixture = create(pageOf(1, 2));
      fixture.componentInstance.onPage({ pageIndex: 1, pageSize: 5, length: 10 });
      listRequest().flush(pageOf(2, 2));

      fixture.componentInstance.confirmRemove(track);
      httpMock.expectOne((r) => r.method === 'DELETE').flush(null, { status: 204, statusText: 'No Content' });

      // Page 2 no longer exists: the API answers an empty page, still with hasPrevPage.
      listRequest().flush({ ...pageOf(2, 1, []), hasPrevPage: true, prevPage: 1 });

      const back = listRequest();
      expect(back.request.params.get('page')).toBe('1');
      back.flush(pageOf(1, 1));
      expect(fixture.componentInstance.page()).toBe(1);
    });

    it('does nothing when the confirmation is cancelled', () => {
      dialogOpen.mockReturnValue({ afterClosed: () => of(false) });
      const fixture = create();
      fixture.componentInstance.confirmRemove(track);
      httpMock.expectNone((r) => r.method === 'DELETE');
    });
  });
});
