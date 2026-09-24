import { describe, it, expect } from 'vitest';
import { trackSubtitle } from './track-subtitle';

describe('trackSubtitle', () => {
  it('joins artist and album', () => {
    expect(trackSubtitle({ artist: 'Frank Ocean', album: 'Endless', originalName: 'a.m4a' })).toBe(
      'Frank Ocean · Endless',
    );
  });

  it('shows whichever of the two exists', () => {
    expect(trackSubtitle({ artist: 'Frank Ocean', originalName: 'a.m4a' })).toBe('Frank Ocean');
    expect(trackSubtitle({ album: 'Endless', originalName: 'a.m4a' })).toBe('Endless');
  });

  it('falls back to the file name', () => {
    expect(trackSubtitle({ originalName: 'solo.mp3' })).toBe('solo.mp3');
  });
});
