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

/** Numéro de série PS1 : quatre lettres, un tiret, cinq chiffres (SCUS-94163). */
export const SERIAL_PATTERN = /^[A-Z]{4}-\d{5}$/;

/*
 * Un jeu appartient à son créateur. La pochette reste sur le disque (comme
 * celles des pistes) ; coverStoredName n'est jamais exposé par toPublic().
 */
export interface GameDoc {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  serial?: string;
  genre?: Genre;
  coverStoredName?: string;
  coverMimeType?: string;
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
    coverStoredName: { type: String, select: false },
    coverMimeType: { type: String },
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
    // coverStoredName n'est présent que si la requête l'a sélectionné.
    hasCover: Boolean(this.coverStoredName),
    createdAt: this.createdAt,
  };
});

export const Game = mongoose.model<GameDoc, GameModel>("Game", schema);
