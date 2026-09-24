import mongoose, { Schema, type AggregatePaginateModel, type Model } from "mongoose";
import aggregatePaginate from "mongoose-aggregate-paginate-v2";
import type { PublicTrack } from "../types";

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio et sa
 * pochette restent sur le disque ; storedName et coverStoredName contiennent
 * les noms techniques utilisés côté serveur et ne sont jamais exposés par
 * toPublic().
 */
export interface TrackDoc {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalName: string;
  storedName: string;
  /** Type du fichier stocké (audio/flac après conversion d'un ALAC). */
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  coverStoredName?: string;
  coverMimeType?: string;
  transcodedFrom?: "alac";
  createdAt: Date;
  updatedAt: Date;
}

export interface TrackMethods {
  toPublic(): PublicTrack;
}

// aggregatePaginate() est ajoutée au modèle par le plugin (voir plus bas).
type TrackModel = Model<TrackDoc, {}, TrackMethods> & AggregatePaginateModel<TrackDoc>;

const schema = new Schema<TrackDoc, TrackModel, TrackMethods>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    artist: { type: String, trim: true },
    album: { type: String, trim: true },
    coverStoredName: { type: String, select: false },
    coverMimeType: { type: String },
    transcodedFrom: { type: String, enum: ["alac"] },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

/*
 * Le plugin ajoute Track.aggregatePaginate(pipeline, { page, limit }) : il
 * exécute le pipeline d'agrégation sur une seule page et compte le total
 * dans la même requête ($facet), puis calcule les métadonnées de pagination.
 */
schema.plugin(aggregatePaginate);

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.method("toPublic", function toPublic(): PublicTrack {
  return {
    id: this.id as string,
    ownerId: String(this.ownerId),
    title: this.title,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    artist: this.artist,
    album: this.album,
    transcodedFrom: this.transcodedFrom,
    // coverStoredName n'est présent que si la requête l'a sélectionné.
    hasCover: Boolean(this.coverStoredName),
    createdAt: this.createdAt,
  };
});

export const Track = mongoose.model<TrackDoc, TrackModel>("Track", schema);
