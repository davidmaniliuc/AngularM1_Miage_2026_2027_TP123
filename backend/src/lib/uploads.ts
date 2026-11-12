import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import {
  ALLOWED_MIME,
  COVERS_DIR,
  GAMES_DIR,
  MAX_FILE_SIZE,
  UPLOADS_DIR,
} from "../config";

/**
 * Crée le dossier des uploads et celui des pochettes au démarrage :
 * l'application doit en disposer avant d'accepter le premier fichier.
 */
export function ensureUploadsDir(): void {
  try {
    // recursive crée UPLOADS_DIR en même temps que ses sous-dossiers.
    for (const dir of [COVERS_DIR, GAMES_DIR]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log(`[startup] Dossier des uploads prêt : ${UPLOADS_DIR}`);
  } catch (error) {
    console.error("[startup] Impossible de créer le dossier des uploads", error);
    throw error;
  }
}

/** Chemin absolu d'un fichier stocké. */
export function audioPath(storedName: string): string {
  return path.join(UPLOADS_DIR, storedName);
}

export type AudioValidation =
  | { ok: true; file: File }
  | { ok: false; message: string };

/**
 * Contrôle ce que le navigateur a envoyé dans le champ "audio".
 *
 * Hono ne fait aucune validation : parseBody() rend soit une chaîne (champ
 * texte), soit un File (champ fichier). On vérifie donc nous-mêmes la nature
 * du champ, son type MIME et sa taille, ce que Multer faisait auparavant.
 */
export function validateAudio(candidate: unknown): AudioValidation {
  if (!(candidate instanceof File)) {
    console.warn("[upload] Aucun fichier reçu dans le champ audio");
    return { ok: false, message: "Fichier audio requis" };
  }

  if (!ALLOWED_MIME.has(candidate.type)) {
    console.warn(`[upload] Type refusé : ${candidate.type}`);
    return { ok: false, message: "Format audio non accepté" };
  }

  if (candidate.size > MAX_FILE_SIZE) {
    console.warn(`[upload] Fichier trop volumineux : ${candidate.size} octets`);
    return { ok: false, message: "Fichier trop volumineux" };
  }

  return { ok: true, file: candidate };
}

/**
 * Écrit le fichier sur le disque sous un nom aléatoire.
 * Le nom d'origine n'est jamais réutilisé comme nom de stockage : il pourrait
 * contenir des caractères dangereux ou provoquer une collision entre
 * utilisateurs. Seule l'extension est conservée, en minuscules.
 */
export async function saveAudio(file: File): Promise<string> {
  const storedName =
    crypto.randomUUID() + path.extname(file.name).toLowerCase();

  await Bun.write(audioPath(storedName), file);
  console.log(`[upload] Fichier écrit : ${storedName} (${file.size} octets)`);

  return storedName;
}

/** Supprime un fichier stocké. L'appelant traite l'erreur éventuelle. */
export async function removeAudio(storedName: string): Promise<void> {
  await fsPromises.unlink(audioPath(storedName));
  console.log(`[upload] Fichier supprimé : ${storedName}`);
}

/**
 * Supprime une liste de fichiers sans jamais lever d'erreur : sert au
 * nettoyage après un échec, où l'erreur d'origine doit rester celle qu'on
 * remonte. Un fichier déjà absent n'est pas une erreur ; un autre échec est
 * journalisé pour que l'administrateur voie le fichier orphelin.
 */
export async function discardFiles(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try {
      await fsPromises.rm(filePath, { force: true });
    } catch (error) {
      console.error(`[upload] Fichier orphelin non supprimé : ${filePath}`, error);
    }
  }
}

/** Levée par writeStream quand le corps dépasse la taille permise. */
export class TooLargeError extends Error {}

/**
 * Écrit un corps de requête sur le disque morceau par morceau : un jeu de
 * 700 Mo n'est jamais entier en mémoire, contrairement à parseBody(). La
 * taille est comptée au fil de l'eau, car Content-Length peut mentir ou
 * manquer. En cas d'échec, le fichier partiel est supprimé.
 * Renvoie le nombre d'octets écrits.
 */
export async function writeStream(
  body: ReadableStream<Uint8Array>,
  filePath: string,
  maxBytes: number,
): Promise<number> {
  const sink = Bun.file(filePath).writer();
  let size = 0;

  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new TooLargeError();
      sink.write(chunk);
      // flush() vide le tampon : la mémoire utilisée reste bornée.
      await sink.flush();
    }
    await sink.end();
    return size;
  } catch (error) {
    await sink.end();
    await discardFiles([filePath]);
    throw error;
  }
}
