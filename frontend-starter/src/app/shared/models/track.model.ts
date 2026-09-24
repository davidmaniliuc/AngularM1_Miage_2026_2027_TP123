/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
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
  createdAt: string;
}
