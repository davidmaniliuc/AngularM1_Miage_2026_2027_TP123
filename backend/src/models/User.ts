import mongoose, { Schema, type Model, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import type { PublicUser } from "../types";

/*
 * Un schéma Mongoose décrit la forme des documents MongoDB et leurs règles de
 * validation. `timestamps` ajoute automatiquement createdAt et updatedAt.
 * En TypeScript, on décrit d'abord la forme du document, puis ses méthodes.
 */
export interface UserDoc {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  verifyPassword(value: string): Promise<boolean>;
  toPublic(): PublicUser;
}

export interface UserStatics {
  register(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<HydratedDocument<UserDoc, UserMethods>>;
}

type UserModel = Model<UserDoc, {}, UserMethods> & UserStatics;

const schema = new Schema<UserDoc, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false empêche de renvoyer le hash par défaut dans les requêtes.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

/**
 * Crée un utilisateur en hachant son mot de passe au passage.
 * bcrypt transforme le mot de passe en empreinte irréversible : le mot de
 * passe d'origine n'est jamais écrit en base ni dans les logs.
 */
schema.static("register", async function register(input: {
  name: string;
  email: string;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return this.create({
    name: input.name,
    email: input.email,
    passwordHash,
  });
});

/** Compare un mot de passe reçu avec l'empreinte stockée. */
schema.method("verifyPassword", function verifyPassword(value: string) {
  return bcrypt.compare(value, this.passwordHash);
});

/** Retourne uniquement les champs qu'une réponse HTTP peut exposer. */
schema.method("toPublic", function toPublic(): PublicUser {
  return {
    id: this.id as string,
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
  };
});

export const User = mongoose.model<UserDoc, UserModel>("User", schema);
