import { Component, effect, inject, input, output, signal } from '@angular/core';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { paletteOf } from '../../shared/utils/cover-palette';

/**
 * Cover image of a track, fetched as a Blob because <img src> cannot send the
 * JWT. Fills its positioned parent; renders nothing until the image is ready,
 * so the parent's format label stays visible as a fallback.
 * The image is decorative (alt=""): the play button already names the track.
 */
@Component({
  selector: 'app-track-cover',
  template: `@if (url(); as src) { <img [src]="src" alt="" (load)="onLoad($event)" (error)="onError()" /> }`,
  styles: `
    :host { position: absolute; inset: 0; pointer-events: none; }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class TrackCoverComponent {
  private readonly service = inject(TrackService);

  readonly track = input.required<Track>();
  readonly url = signal<string | null>(null);
  /** Accent colors of the loaded image; [] without a cover. */
  readonly palette = output<string[]>();

  constructor() {
    effect((onCleanup) => {
      const track = this.track();
      this.url.set(null);
      this.palette.emit([]);
      if (!track.hasCover) return;

      let objectUrl: string | undefined;
      const subscription = this.service.cover(track.id).subscribe({
        next: (blob) => {
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
        },
        error: (error) => console.warn('[TrackCover] Pochette indisponible', track.id, error),
      });

      // Runs when the track changes and when the component is destroyed.
      onCleanup(() => {
        subscription.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }

  /** The Blob URL is same-origin, so the canvas can read its pixels. */
  onLoad(event: Event): void {
    this.palette.emit(paletteOf(event.target as HTMLImageElement));
  }

  onError(): void {
    this.url.set(null);
    this.palette.emit([]);
  }
}
