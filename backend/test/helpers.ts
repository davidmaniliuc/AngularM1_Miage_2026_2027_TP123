import path from "node:path";
import mongoose from "mongoose";
import { createApp } from "../src/app";
import { Track } from "../src/models/Track";
import type { PublicUser } from "../src/types";

/** Une seule instance d'application est partagée par tous les tests. */
export const app = createApp();

/**
 * Appelle l'API sans ouvrir de port : app.fetch reçoit directement un objet
 * Request standard et retourne une Response standard.
 */
export function request(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`http://localhost${path}`, init)));
}

/** Construit l'en-tête Authorization attendu par les routes privées. */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Inscrit un utilisateur via l'API et retourne son jeton. */
export async function registerUser(
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ token: string; user: PublicUser }> {
  const body = {
    name: "Alice",
    email: `alice-${crypto.randomUUID()}@example.com`,
    password: "MotDePasse1!",
    ...overrides,
  };

  const response = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status !== 201) {
    throw new Error(`Inscription de test échouée : ${response.status}`);
  }

  return response.json() as Promise<{ token: string; user: PublicUser }>;
}

/**
 * Crée des pistes directement en base, sans passer par l'upload HTTP.
 * `createdAt` est forcé pour que l'ordre de tri soit déterministe.
 */
export async function seedTracks(ownerId: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Track.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title: `Piste ${index + 1}`,
      originalName: `piste-${index + 1}.mp3`,
      storedName: `stocke-${index + 1}.mp3`,
      mimeType: "audio/mpeg",
      size: 1024,
      createdAt: new Date(2026, 0, 1, 0, 0, index),
    });
  }
}

/** Ouvre la connexion à la base de test si elle n'est pas déjà ouverte. */
export async function connectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI as string);
  }
}

/** Vide toutes les collections entre deux tests pour les isoler. */
export async function resetDb(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name]?.deleteMany({});
  }
}

/** Referme la connexion à la fin d'un fichier de test. */
export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Charge une fixture de test/fixtures comme si le navigateur l'envoyait. */
export async function fixtureFile(name: string, type: string, as = name): Promise<File> {
  const bytes = await Bun.file(path.join(import.meta.dir, "fixtures", name)).arrayBuffer();
  return new File([bytes], as, { type });
}
