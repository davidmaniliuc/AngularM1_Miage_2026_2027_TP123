import mongoose, { Schema } from "mongoose";

/** Private metadata only: files and public catalogue entries are separate future features. */
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 5000 },
  region: { type: String, trim: true, maxlength: 80 },
  releaseYear: { type: Number, min: 1900, max: 2100, validate: Number.isInteger },
}, { timestamps: true });

schema.index({ ownerId: 1, createdAt: -1, _id: -1 });

export const Game = mongoose.model("Game", schema);

export function publicGame(game: mongoose.InferSchemaType<typeof schema> & { _id: mongoose.Types.ObjectId }) {
  return {
    id: String(game._id), ownerId: String(game.ownerId), title: game.title,
    description: game.description, region: game.region, releaseYear: game.releaseYear,
    createdAt: game.createdAt, updatedAt: game.updatedAt,
  };
}
