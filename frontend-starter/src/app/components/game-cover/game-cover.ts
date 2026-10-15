import { Component, effect, inject, input, signal } from '@angular/core';
import { Game } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';

/**
 * Cover image of a game, fetched as a Blob because <img src> cannot send the
 * JWT. Shows the default image without a cover, while loading, or on error.
 */
@Component({
  selector: 'app-game-cover',
  template: `<img [src]="url() ?? defaultSrc" [alt]="alt()" />`,
  styles: `
    :host { display: block; }
    img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: inherit; }
  `,
})
export class GameCoverComponent {
  private readonly service = inject(GameService);

  readonly game = input.required<Game>();
  readonly alt = input('');
  readonly defaultSrc = '/game-placeholder.svg';
  readonly url = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const game = this.game();
      this.url.set(null);
      if (!game.hasCover) return;

      let objectUrl: string | undefined;
      const subscription = this.service.cover(game.id).subscribe({
        next: (blob) => {
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
        },
        error: (error) => console.warn('[GameCover] Pochette indisponible', game.id, error),
      });

      onCleanup(() => {
        subscription.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
