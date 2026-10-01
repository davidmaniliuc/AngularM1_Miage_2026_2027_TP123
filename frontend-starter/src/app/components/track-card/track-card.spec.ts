import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TrackCardComponent } from './track-card';
import { Track } from '../../shared/models/track.model';

const track: Track = {
  id: 't1',
  title: 'Punish',
  originalName: 'punish.mp3',
  mimeType: 'audio/mpeg',
  size: 1000,
  ownerId: 'u1',
  visibility: 'private',
  hasCover: false,
  createdAt: '2026-09-01T10:00:00.000Z',
};

describe('TrackCardComponent — couleurs de la pochette', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TrackCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(TrackCardComponent);
    fixture.componentRef.setInput('track', track);
    fixture.componentRef.setInput('current', true);
    fixture.detectChanges();
    const card: HTMLElement = fixture.nativeElement.querySelector('.track-card');
    return { fixture, card };
  }

  it('exposes the two cover colors as CSS variables', () => {
    const { fixture, card } = create();

    fixture.componentInstance.palette.set(['hsl(0 74% 45%)', 'hsl(135 68% 37%)']);
    fixture.detectChanges();

    expect(card.style.getPropertyValue('--cover-accent')).toBe('hsl(0 74% 45%)');
    expect(card.style.getPropertyValue('--cover-accent-2')).toBe('hsl(135 68% 37%)');
  });

  it('reuses the single color for both stops of the gradient', () => {
    const { fixture, card } = create();

    fixture.componentInstance.palette.set(['hsl(0 74% 45%)']);
    fixture.detectChanges();

    expect(card.style.getPropertyValue('--cover-accent-2')).toBe('hsl(0 74% 45%)');
  });

  it('sets no variable without a cover, so the default orange applies', () => {
    const { card } = create();

    expect(card.style.getPropertyValue('--cover-accent')).toBe('');
    expect(card.style.getPropertyValue('--cover-accent-2')).toBe('');
  });
});
