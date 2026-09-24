/**
 * Mirrors the backend upload rules (backend/src/config.ts) so the user gets
 * immediate feedback. The backend stays the only authority: anyone can bypass
 * this code with curl or the DevTools.
 */
export const ALLOWED_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/flac',
  'audio/x-flac',
]);

export const MAX_AUDIO_SIZE = 100 * 1024 * 1024;

/** Returns an error message, or null when the file can be sent. */
export function validateAudioFile(file: File | undefined): string | null {
  if (!file) return 'Choisissez un fichier audio.';
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
    return `Format non accepté (${file.type || 'inconnu'}). Formats possibles : MP3, WAV, OGG, M4A, FLAC.`;
  }
  if (file.size > MAX_AUDIO_SIZE) {
    return `Fichier trop volumineux (${formatSize(file.size)}). Taille maximale : 100 Mo.`;
  }
  return null;
}

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Formats a size in bytes, as returned by the API, into o / Ko / Mo. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${decimal.format(bytes / 1024)} Ko`;
  return `${decimal.format(bytes / (1024 * 1024))} Mo`;
}

const FORMAT_LABELS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
  'audio/flac': 'FLAC',
  'audio/x-flac': 'FLAC',
};

/** Short, human-readable label for a MIME type. */
export function formatFormat(mimeType: string): string {
  return FORMAT_LABELS[mimeType] ?? mimeType.split('/').pop()!.replace(/^x-/, '').toUpperCase();
}
