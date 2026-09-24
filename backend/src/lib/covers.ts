import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { COVERS_DIR } from "../config";

// Une pochette dépasse rarement 1 Mo ; au-delà de 5 Mo, on l'ignore.
export const MAX_COVER_SIZE = 5 * 1024 * 1024;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

const EXTENSIONS: Record<ImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Identifie une image par ses premiers octets (sa « signature »).
 * Le format annoncé par le tag n'est jamais cru : un fichier piégé pourrait
 * déclarer image/jpeg et contenir du SVG ou du HTML.
 */
export function detectImageType(data: Uint8Array): ImageMime | null {
  const startsWith = (signature: number[], offset = 0) =>
    data.length >= offset + signature.length &&
    signature.every((byte, index) => data[offset + index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP : "RIFF", 4 octets de taille, puis "WEBP".
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** Chemin absolu d'une pochette stockée. */
export function coverPath(storedName: string): string {
  return path.join(COVERS_DIR, storedName);
}

/**
 * Enregistre une pochette sous un nom aléatoire. Renvoie null, sans lever
 * d'erreur, si l'image est refusée : une pochette ne bloque jamais l'upload.
 */
export async function saveCover(
  data: Uint8Array,
): Promise<{ storedName: string; mimeType: ImageMime } | null> {
  const mimeType = detectImageType(data);

  if (!mimeType) {
    console.warn("[cover] Pochette ignorée : format d'image non reconnu");
    return null;
  }

  if (data.byteLength > MAX_COVER_SIZE) {
    console.warn(`[cover] Pochette ignorée : ${data.byteLength} octets`);
    return null;
  }

  const storedName = crypto.randomUUID() + EXTENSIONS[mimeType];
  await Bun.write(coverPath(storedName), data);
  console.log(`[cover] Pochette écrite : ${storedName} (${data.byteLength} octets)`);

  return { storedName, mimeType };
}

/** Supprime une pochette stockée. L'appelant traite l'erreur éventuelle. */
export async function removeCover(storedName: string): Promise<void> {
  await fsPromises.unlink(coverPath(storedName));
  console.log(`[cover] Pochette supprimée : ${storedName}`);
}
