import mongoose, { Schema, type Model } from "mongoose";

/** Une carte mémoire (slot 0) ou une sauvegarde rapide (état de la machine). */
export const SAVE_KINDS = ["memcard", "state"] as const;
export type SaveKind = (typeof SAVE_KINDS)[number];

/*
 * Une sauvegarde par jeu, par compte et par type : l'envoyer remplace la
 * précédente. Le fichier reste sur le disque ; storedName n'est jamais exposé.
 */
export interface GameSaveDoc {
  ownerId: mongoose.Types.ObjectId;
  gameId: mongoose.Types.ObjectId;
  kind: SaveKind;
  storedName: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<GameSaveDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gameId: { type: Schema.Types.ObjectId, ref: "Game", required: true },
    kind: { type: String, enum: SAVE_KINDS, required: true },
    storedName: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true },
);

schema.index({ ownerId: 1, gameId: 1, kind: 1 }, { unique: true });

export const GameSave = mongoose.model<GameSaveDoc, Model<GameSaveDoc>>("GameSave", schema);
