import path from "node:path";

/*
 * Toute la configuration passe par des variables d'environnement.
 * Bun charge automatiquement le fichier .env, il n'y a rien à appeler.
 */

export const PORT = Number(process.env.PORT) || 3000;

export const MONGODB_URI = process.env.MONGODB_URI;

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
export const JWT_SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// hono/jwt exige que l'algorithme soit précisé explicitement à la signature
// comme à la vérification.
export const JWT_ALG = "HS256" as const;

// Durée de vie d'un jeton : 2 heures, exprimées en secondes.
export const TOKEN_TTL_SECONDS = 2 * 60 * 60;

/*
 * Les fichiers audio restent sur le disque du serveur dans ce TP.
 * MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
 * UPLOADS_DIR est surchargeable pour que les tests écrivent ailleurs.
 */
export const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR || "data/uploads",
);

// Les pochettes extraites des fichiers audio sont rangées à part.
export const COVERS_DIR = path.join(UPLOADS_DIR, "covers");

// La taille maximale d'un fichier audio est de 100 Mo : un morceau sans
// perte (FLAC, ALAC) de 5 minutes pèse souvent 30 à 50 Mo.
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/*
 * Premier filtre, peu coûteux, sur le type annoncé par le navigateur.
 * Le vrai format est ensuite déterminé par le contenu (lib/metadata.ts).
 */
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/x-flac",
]);
