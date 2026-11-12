import mongoose, { Schema, type Model } from "mongoose";
import type { PublicBios } from "../types";

/*
 * Un BIOS est toujours privé : seul son propriétaire le liste et le
 * télécharge. Le fichier reste sur le disque ; storedName n'est jamais exposé.
 */
export interface BiosDoc {
  ownerId: mongoose.Types.ObjectId;
  storedName: string;
  originalName: string;
  size: number;
  /** Faux pour une image absente de la table du cœur : non identifiée, pas invalide. */
  known: boolean;
  /** Région de la bibliothèque substation : america, europe ou japan. */
  region?: string;
  version?: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BiosMethods {
  toPublic(): PublicBios;
}

type BiosModel = Model<BiosDoc, {}, BiosMethods>;

const schema = new Schema<BiosDoc, BiosModel, BiosMethods>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    storedName: { type: String, required: true, select: false },
    originalName: { type: String, required: true, trim: true },
    size: { type: Number, required: true },
    known: { type: Boolean, required: true },
    region: { type: String, enum: ["america", "europe", "japan"] },
    version: { type: String },
    description: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.method("toPublic", function toPublic(): PublicBios {
  return {
    id: this.id as string,
    ownerId: String(this.ownerId),
    originalName: this.originalName,
    size: this.size,
    known: this.known,
    region: this.region,
    version: this.version,
    description: this.description,
    isDefault: Boolean(this.isDefault),
    createdAt: this.createdAt,
  };
});

export const Bios = mongoose.model<BiosDoc, BiosModel>("Bios", schema);
