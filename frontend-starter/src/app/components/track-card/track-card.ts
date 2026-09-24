import { Component, computed, input, output } from '@angular/core';
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

  readonly play = output<void>();
  readonly remove = output<void>();

  readonly format = computed(() => formatFormat(this.track().mimeType));
  readonly size = computed(() => formatSize(this.track().size));
  readonly subtitle = computed(() => trackSubtitle(this.track()));
  readonly formatClass = computed(() => 'format-' + this.format().toLowerCase());
  readonly showPause = computed(() => this.current() && this.playing());
  readonly playLabel = computed(
    () => `${this.showPause() ? 'Mettre en pause' : 'Lire'} ${this.track().title}`,
  );
}
