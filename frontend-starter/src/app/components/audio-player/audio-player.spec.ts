import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioPlayerComponent } from './audio-player';
import { Track } from '../../shared/models/track.model';

const track: Track = {
  id: 't1',
  title: 'Blues en La',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 1000,
  ownerId: 'u1',
  visibility: 'private',
  hasCover: false,
  createdAt: '2026-09-01T10:00:00.000Z',
};

describe('AudioPlayerComponent — barre de lecture', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AudioPlayerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(AudioPlayerComponent);
    fixture.componentRef.setInput('track', track);
    fixture.componentRef.setInput('src', '');
    fixture.detectChanges();
    const player = fixture.componentInstance;
    player.duration.set(200);
    const wave: HTMLElement = fixture.nativeElement.querySelector('.wave');
    // The waveform is 400px wide starting at x = 100: 1px = 0.5s.
    wave.getBoundingClientRect = () => ({ left: 100, width: 400 }) as DOMRect;
    const audio: HTMLAudioElement = fixture.nativeElement.querySelector('audio');
    return { fixture, player, wave, audio };
  }

  /** Minimal PointerEvent: jsdom does not always implement the class. */
  const pointer = (wave: HTMLElement, clientX: number, button = 0) =>
    ({ clientX, button, pointerId: 1, currentTarget: wave, preventDefault: () => {} }) as unknown as PointerEvent;

  it('follows the pointer while dragging without moving the audio, then seeks on release', () => {
    const { fixture, player, wave, audio } = create();

    player.startScrub(pointer(wave, 200)); // 25 %
    player.moveScrub(pointer(wave, 400)); // 75 %
    fixture.detectChanges();

    expect(player.shownTime()).toBe(150);
    expect(audio.currentTime).toBe(0);
    expect(wave.classList).toContain('dragging');
    expect(fixture.nativeElement.querySelector('.time').textContent).toContain('2:30');

    player.endScrub(pointer(wave, 400));
    fixture.detectChanges();

    expect(audio.currentTime).toBe(150);
    expect(player.dragTime()).toBeNull();
    expect(wave.classList).not.toContain('dragging');
  });

  it('a simple click still seeks', () => {
    const { player, wave, audio } = create();

    player.startScrub(pointer(wave, 300));
    player.endScrub(pointer(wave, 300));

    expect(audio.currentTime).toBe(100);
  });

  it('clamps a drag outside the waveform to the start or the end', () => {
    const { player, wave } = create();

    player.startScrub(pointer(wave, 300));
    player.moveScrub(pointer(wave, 900));
    expect(player.shownTime()).toBe(200);

    player.moveScrub(pointer(wave, -50));
    expect(player.shownTime()).toBe(0);
  });

  it('does not seek when the drag is cancelled', () => {
    const { player, wave, audio } = create();

    player.startScrub(pointer(wave, 400));
    player.cancelScrub();
    player.endScrub(pointer(wave, 400));

    expect(audio.currentTime).toBe(0);
    expect(player.shownTime()).toBe(0);
  });

  it('ignores the pointer until the duration is known', () => {
    const { player, wave } = create();
    player.duration.set(0);

    player.startScrub(pointer(wave, 300));

    expect(player.dragTime()).toBeNull();
  });
});
