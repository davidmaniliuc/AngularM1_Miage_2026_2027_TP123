/** Fixed genre list; values match the backend (see API_CONTRACT.md). */
export const GENRES = [
  { value: 'rpg', label: 'RPG' },
  { value: 'course', label: 'Course' },
  { value: 'plateforme', label: 'Plateforme' },
  { value: 'action', label: 'Action' },
  { value: 'aventure', label: 'Aventure' },
  { value: 'combat', label: 'Combat' },
  { value: 'sport', label: 'Sport' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'strategie', label: 'Stratégie' },
  { value: 'autre', label: 'Autre' },
] as const;

export type Genre = (typeof GENRES)[number]['value'];

export function genreLabel(genre: string | undefined): string {
  return GENRES.find((item) => item.value === genre)?.label ?? '';
}

/** Fixed region list; values match the backend. */
export const REGIONS = [
  { value: 'ntsc-u', label: 'NTSC-U (Amérique)' },
  { value: 'ntsc-j', label: 'NTSC-J (Japon)' },
  { value: 'pal', label: 'PAL (Europe)' },
] as const;

export type Region = (typeof REGIONS)[number]['value'];

export function regionLabel(region: string | undefined): string {
  return REGIONS.find((item) => item.value === region)?.label ?? '';
}

/** PS1 serial: four letters, a dash, five digits (SCUS-94163). */
export const SERIAL_PATTERN = /^[A-Za-z]{4}-\d{5}$/;

/** Game metadata returned by the API. */
export interface Game {
  id: string;
  ownerId: string;
  title: string;
  serial?: string;
  genre?: Genre;
  region?: Region;
  year?: number;
  favorite: boolean;
  /** A cover is available at GET /api/games/:id/cover. */
  hasCover: boolean;
  createdAt: string;
}

/** Editable fields of the game form. */
export interface GameFields {
  title: string;
  serial: string;
  genre: Genre | '';
  region: Region | '';
  /** Digits only, or empty to clear. */
  year: string;
  cover?: File;
  /** Edit only: delete the current cover. */
  removeCover?: boolean;
}

export type GameSort = 'title' | 'year' | 'added';

/** Query of GET /api/games; an absent field means "no filter" or the default. */
export interface GameListQuery {
  q?: string;
  region?: Region;
  genre?: Genre;
  favorite?: boolean;
  sort?: GameSort;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
