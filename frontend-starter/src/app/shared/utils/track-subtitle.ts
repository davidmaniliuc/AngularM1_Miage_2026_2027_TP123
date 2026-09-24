import { Track } from '../models/track.model';

/** "Artist · Album" from the file tags, or the file name when there are none. */
export function trackSubtitle(track: Pick<Track, 'artist' | 'album' | 'originalName'>): string {
  const parts = [track.artist, track.album].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : track.originalName;
}
