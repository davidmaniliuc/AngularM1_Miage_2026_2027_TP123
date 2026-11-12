import mongoose, { Schema, type Model } from "mongoose";
import type { PublicGame } from "../types";

/** Liste fixe des genres ; le frontend en affiche les libellés français. */
export const GENRES = [
  "rpg",
  "course",
  "plateforme",
  "action",
  "aventure",
  "combat",
  "sport",
  "puzzle",
  "strategie",
  "autre",
] as const;
export type Genre = (typeof GENRES)[number];

export function isGenre(value: unknown): value is Genre {
  return GENRES.includes(value as Genre);
}

/** Régions d'un jeu PS1 (norme de couleur / zone de commercialisation). */
export const REGIONS = ["ntsc-u", "ntsc-j", "pal"] as const;
export type Region = (typeof REGIONS)[number];

export function isRegion(value: unknown): value is Region {
  return REGIONS.includes(value as Region);
}

export const MIN_YEAR = 1994;
export const MAX_YEAR = 2100;

/** Numéro de série PS1 : quatre lettres, un tiret, cinq chiffres (SCUS-94163). */
export const SERIAL_PATTERN = /^[A-Z]{4}-\d{5}$/;

/** Formats d'image disque acceptés : un .bin passe éventuellement avec son .cue. */
export const DISC_FORMATS = ["chd", "bin"] as const;
export type DiscFormat = (typeof DISC_FORMATS)[number];

/*
 * Un jeu appartient à son créateur. La pochette reste sur le disque (comme
 * celles des pistes) ; coverStoredName n'est jamais exposé par toPublic().
 */
export interface GameDoc {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  serial?: string;
  genre?: Genre;
  region?: Region;
  year?: number;
  favorite: boolean;
  coverStoredName?: string;
  coverMimeType?: string;
  discStoredName?: string;
  discName?: string;
  discSize?: number;
  discFormat?: DiscFormat;
  discCue?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameMethods {
  toPublic(): PublicGame;
}

type GameModel = Model<GameDoc, {}, GameMethods>;

const schema = new Schema<GameDoc, GameModel, GameMethods>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    serial: { type: String, trim: true, uppercase: true, match: SERIAL_PATTERN },
    genre: { type: String, enum: GENRES },
    region: { type: String, enum: REGIONS },
    year: { type: Number, min: MIN_YEAR, max: MAX_YEAR, validate: Number.isInteger },
    favorite: { type: Boolean, default: false },
    coverStoredName: { type: String, select: false },
    coverMimeType: { type: String },
    // Comme la pochette, le fichier du jeu reste sur le disque, jamais exposé.
    discStoredName: { type: String, select: false },
    discName: { type: String },
    discSize: { type: Number },
    discFormat: { type: String, enum: DISC_FORMATS },
    discCue: { type: String },
  },
  { timestamps: true },
);

schema.index({ ownerId: 1, createdAt: -1 });

schema.method("toPublic", function toPublic(): PublicGame {
  return {
    id: this.id as string,
    ownerId: String(this.ownerId),
    title: this.title,
    serial: this.serial,
    genre: this.genre,
    region: this.region,
    year: this.year,
    favorite: Boolean(this.favorite),
    // coverStoredName n'est présent que si la requête l'a sélectionné.
    hasCover: Boolean(this.coverStoredName),
    disc:
      this.discName && this.discFormat
        ? { name: this.discName, size: this.discSize ?? 0, format: this.discFormat, cue: this.discCue }
        : undefined,
    createdAt: this.createdAt,
  };
});

export const Game = mongoose.model<GameDoc, GameModel>("Game", schema);
