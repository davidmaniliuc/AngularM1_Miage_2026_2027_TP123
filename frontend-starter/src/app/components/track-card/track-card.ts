import { Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Track } from '../../shared/models/track.model';
import { formatFormat, formatSize } from '../../shared/utils/audio-file';
import { trackSubtitle } from '../../shared/utils/track-subtitle';
import { TrackCoverComponent } from '../track-cover/track-cover';

/** One track of the library, shown as a horizontal card. */
@Component({
  selector: 'app-track-card',
  imports: [
    DatePipe,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    TrackCoverComponent,
  ],
  templateUrl: './track-card.html',
  styleUrl: './track-card.css',
})
export class TrackCardComponent {
  readonly track = input.required<Track>();
  /** This track is loaded in the player. */
  readonly current = input(false);
  /** The player is currently playing (only meaningful when `current`). */
  readonly playing = input(false);
  /** The audio Blob of this track is being downloaded. */
  readonly loading = input(false);
  /** The current user owns this track: only then can it be shared or deleted. */
  readonly mine = input(true);
  /** The DELETE of this track is pending. */
  readonly deleting = input(false);

  readonly play = output<void>();
  readonly remove = output<void>();
  readonly toggleVisibility = output<void>();

  /** Colors of the cover, used by the "now playing" gradient. */
  readonly palette = signal<string[]>([]);
  readonly accent = computed(() => this.palette()[0] ?? null);
  readonly accent2 = computed(() => this.palette()[1] ?? this.palette()[0] ?? null);

  readonly format = computed(() => formatFormat(this.track().mimeType));
  readonly size = computed(() => formatSize(this.track().size));
  readonly subtitle = computed(() => trackSubtitle(this.track()));
  readonly sharedBy = computed(() =>
    this.mine() ? '' : `Partagée par ${this.track().ownerName ?? 'un autre utilisateur'}`,
  );
  readonly isPublic = computed(() => this.track().visibility === 'public');
  readonly formatClass = computed(() => 'format-' + this.format().toLowerCase());
  readonly showPause = computed(() => this.current() && this.playing());
  readonly playLabel = computed(
    () => `${this.showPause() ? 'Mettre en pause' : 'Lire'} ${this.track().title}`,
  );
}
