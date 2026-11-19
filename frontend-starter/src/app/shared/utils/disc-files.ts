import { formatSize } from './audio-file';

/**
 * Mirrors the backend rules for POST /api/games/disc (backend/src/config.ts)
 * so the user sees a mistake before a long upload. The backend stays the
 * only authority.
 */
export const MAX_GAME_SIZE = 1024 * 1024 * 1024;

/** What gets sent: one image, plus the text of its .cue for a .bin. */
export interface PickedDisc {
  file: File;
  cue?: string;
}

export type DiscPick = { ok: true; disc: PickedDisc } | { ok: false; message: string };

const extension = (file: File) => file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

/** FILE lines of a .cue: the names of the images it points to. */
export function cueFiles(cue: string): string[] {
  return [...cue.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim)].map((match) => match[1] ?? match[2]);
}

/**
 * Turns picked files into the disc to send: a .chd wins; else a .cue with
 * the one .bin it names; else a single .bin. Like the emulator, a .cue with
 * several FILEs (one .bin per track) is refused: it must become a .chd.
 */
export async function pickDisc(files: File[]): Promise<DiscPick> {
  const chd = files.find((file) => extension(file) === '.chd');
  const bins = files.filter((file) => extension(file) === '.bin');
  const cueFile = files.find((file) => extension(file) === '.cue');

  let disc: PickedDisc;
  if (chd) {
    disc = { file: chd };
  } else if (cueFile) {
    const cue = await cueFile.text();
    const names = cueFiles(cue);
    if (names.length > 1) {
      return {
        ok: false,
        message: `Ce .cue référence ${names.length} fichiers .bin : convertissez le jeu en .chd (chdman createcd) ou fusionnez ses pistes en un seul .bin.`,
      };
    }
    const bin = bins.find((file) => file.name === names[0]) ?? (bins.length === 1 ? bins[0] : undefined);
    if (!bin) return { ok: false, message: `Ajoutez le fichier ${names[0] ?? '.bin'} avec son .cue.` };
    disc = { file: bin, cue };
  } else if (bins.length === 1) {
    disc = { file: bins[0] };
  } else if (bins.length > 1) {
    return { ok: false, message: 'Plusieurs .bin : ajoutez le .cue du jeu, ou envoyez un .chd.' };
  } else {
    return { ok: false, message: 'Choisissez un .chd, un .bin, ou un .cue avec son .bin.' };
  }

  if (disc.file.size > MAX_GAME_SIZE) {
    return { ok: false, message: `Fichier trop volumineux (${formatSize(disc.file.size)}). Taille maximale : 1 Go.` };
  }
  return { ok: true, disc };
}
