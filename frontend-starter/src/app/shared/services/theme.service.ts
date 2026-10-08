import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'gpc-theme';

/**
 * Light / dark theme. Without a stored choice the app follows the system
 * (styles.scss uses `color-scheme: light dark`); once the user clicks the
 * toggle, the choice is written to `<html data-theme>` and localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  private readonly stored = signal<Theme | null>(readStored());
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly theme = computed<Theme>(() => this.stored() ?? (this.systemDark() ? 'dark' : 'light'));

  constructor() {
    this.media?.addEventListener?.('change', (event) => this.systemDark.set(event.matches));
    this.apply(this.stored());
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.stored.set(next);
    this.apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the choice only lasts for this tab.
    }
  }

  private apply(theme: Theme | null): void {
    const root = this.document.documentElement;
    if (theme) root.dataset['theme'] = theme;
    else delete root.dataset['theme'];
  }
}

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}
