import { Component, inject, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../shared/services/auth.service';
import { PlaybackService } from '../../shared/services/playback.service';
import { AudioPlayerComponent } from '../audio-player/audio-player';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule, AudioPlayerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly playback = inject(PlaybackService);
  private readonly player = viewChild(AudioPlayerComponent);

  readonly currentUser = this.auth.currentUser;

  constructor() {
    // A click on the playing track's card pauses the player mounted here.
    this.playback.attachToggle(() => this.player()?.toggle());
  }

  logout(): void {
    this.playback.stop();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
