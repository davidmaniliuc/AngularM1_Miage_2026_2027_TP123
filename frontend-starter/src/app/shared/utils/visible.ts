import { DestroyRef, ElementRef, Signal, inject, signal } from '@angular/core';

/**
 * Becomes true once the host element comes near the viewport (200px ahead),
 * then stays true. Covers use it so a page of 48 games only downloads the
 * ones on screen. Call it from a constructor (injection context).
 */
export function nearViewport(): Signal<boolean> {
  const visible = signal(false);
  if (typeof IntersectionObserver === 'undefined') {
    visible.set(true);
    return visible;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        visible.set(true);
        observer.disconnect();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(inject(ElementRef<HTMLElement>).nativeElement);
  inject(DestroyRef).onDestroy(() => observer.disconnect());
  return visible;
}
