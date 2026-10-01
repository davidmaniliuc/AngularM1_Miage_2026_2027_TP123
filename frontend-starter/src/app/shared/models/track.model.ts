/** "private": only the owner sees it; "public": every user can list and play it. */
export type Visibility = 'private' | 'public';

/** Which tracks GET /api/tracks returns: mine, other users' public ones, or both. */
export type TrackScope = 'all' | 'mine' | 'others';

/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  ownerId: string;
  /** Owner's name, only sent by the list endpoint. */
  ownerName?: string;
  title: string;
  originalName: string;
  /** Type of the stored file: audio/flac for a converted ALAC. */
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  /** "alac" when the uploaded file was converted to FLAC. */
  transcodedFrom?: string;
  /** A cover is available at GET /api/tracks/:id/cover. */
  hasCover: boolean;
  visibility: Visibility;
  createdAt: string;
}
