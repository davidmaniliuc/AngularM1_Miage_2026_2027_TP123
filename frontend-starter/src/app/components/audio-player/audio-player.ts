import { Component, ElementRef, computed, effect, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Track } from '../../shared/models/track.model';
import { formatFormat } from '../../shared/utils/audio-file';
import { trackSubtitle } from '../../shared/utils/track-subtitle';
import { TrackCoverComponent } from '../track-cover/track-cover';
import { computePeaks } from '../../shared/utils/waveform';

const BARS = 96;
const FLAT = Array.from({ length: BARS }, () => 0.3);

/**
 * Bottom player bar. The page owns the ObjectURL (creation and revocation);
 * this component only plays it and draws the waveform of the current Blob.
 */
@Component({
  selector: 'app-audio-player',
  imports: [MatButtonModule, MatIconModule, TrackCoverComponent],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.css',
})
export class AudioPlayerComponent {
  readonly track = input.required<Track>();
  readonly src = input.required<string>();
  readonly blob = input<Blob>();

  readonly playingChange = output<boolean>();
  readonly audioError = output<void>();

  private readonly audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');

  readonly playing = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly muted = signal(false);
  readonly peaks = signal<number[]>(FLAT);

  protected readonly Math = Math;

  readonly format = computed(() => formatFormat(this.track().mimeType));
  readonly subtitle = computed(() => trackSubtitle(this.track()));
  readonly progress = computed(() => (this.duration() ? this.currentTime() / this.duration() : 0));
  readonly bars = computed(() => {
    const played = this.progress() * this.peaks().length;
    return this.peaks().map((peak, index) => ({ height: Math.max(8, Math.round(peak * 100)), played: index < played }));
  });

  constructor() {
    effect(() => {
      const blob = this.blob();
      this.peaks.set(FLAT);
      if (!blob) return;
      void computePeaks(blob, BARS).then((peaks) => {
        // Ignore a late result if another track was loaded meanwhile.
        if (peaks.length && this.blob() === blob) this.peaks.set(peaks);
      });
    });
  }

  toggle(): void {
    const audio = this.audio().nativeElement;
    if (audio.paused) {
      audio.play()?.catch((error: unknown) => console.warn('[AudioPlayer] Lecture refusée', error));
    } else {
      audio.pause();
    }
  }

  skip(seconds: number): void {
    this.seekTo(this.currentTime() + seconds);
  }

  seekFromPointer(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width) return;
    this.seekTo(((event.clientX - rect.left) / rect.width) * this.duration());
  }

  seekFromKeyboard(event: KeyboardEvent): void {
    const moves: Record<string, number> = {
      ArrowRight: this.currentTime() + 5,
      ArrowUp: this.currentTime() + 5,
      ArrowLeft: this.currentTime() - 5,
      ArrowDown: this.currentTime() - 5,
      Home: 0,
      End: this.duration(),
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    this.seekTo(moves[event.key]);
  }

  toggleMute(): void {
    const audio = this.audio().nativeElement;
    audio.muted = !audio.muted;
    this.muted.set(audio.muted);
  }

  onPlayState(playing: boolean): void {
    this.playing.set(playing);
    this.playingChange.emit(playing);
  }

  onTimeUpdate(): void {
    this.currentTime.set(this.audio().nativeElement.currentTime);
  }

  onMetadata(): void {
    const duration = this.audio().nativeElement.duration;
    this.duration.set(Number.isFinite(duration) ? duration : 0);
  }

  formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  private seekTo(seconds: number): void {
    if (!this.duration()) return;
    const audio = this.audio().nativeElement;
    audio.currentTime = Math.min(this.duration(), Math.max(0, seconds));
    this.currentTime.set(audio.currentTime);
  }
}
