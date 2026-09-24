import path from "node:path";
import { audioPath, discardFiles } from "./uploads";
import { coverPath, saveCover } from "./covers";
import { readMetadata, type AudioKind } from "./metadata";
import { alacToFlac } from "./transcode";

export interface ProcessedAudio {
  /** Nom du fichier à conserver : différent de l'original après conversion. */
  storedName: string;
  mimeType: string;
  size: number;
  title?: string;
  artist?: string;
  album?: string;
  cover?: { storedName: string; mimeType: string };
  transcodedFrom?: "alac";
}

export type ProcessResult =
  | { ok: true; audio: ProcessedAudio }
  | { ok: false; message: string };

// Type MIME enregistré pour chaque format stocké tel quel.
const STORED_MIME: Record<Exclude<AudioKind, "alac">, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/mp4",
  flac: "audio/flac",
};

/** Fichiers créés par processAudio, sans l'original. */
export function createdFiles(audio: ProcessedAudio, originalStoredName: string): string[] {
  const files: string[] = [];
  if (audio.storedName !== originalStoredName) files.push(audioPath(audio.storedName));
  if (audio.cover) files.push(coverPath(audio.cover.storedName));
  return files;
}

/**
 * Analyse un fichier déjà écrit dans UPLOADS_DIR :
 * 1. détermine le format réel par le contenu ;
 * 2. convertit l'ALAC en FLAC (<même uuid>.flac) ;
 * 3. extrait la pochette, sauf si extractCover vaut false.
 *
 * Ne supprime jamais l'original : l'appelant le fait une fois la base à jour.
 * En cas d'exception, supprime d'abord ce qu'elle a elle-même créé.
 */
export async function processAudio(
  storedName: string,
  { extractCover = true }: { extractCover?: boolean } = {},
): Promise<ProcessResult> {
  const meta = await readMetadata(audioPath(storedName));

  if (!meta.kind) {
    console.warn(`[upload] Contenu non reconnu : ${storedName}`);
    return { ok: false, message: "Format audio non accepté" };
  }
  console.log(`[upload] Format détecté : ${meta.kind} (${storedName})`);

  const created: string[] = [];
  try {
    let finalName = storedName;
    let mimeType: string;
    let transcodedFrom: "alac" | undefined;

    if (meta.kind === "alac") {
      finalName = `${path.parse(storedName).name}.flac`;
      // Ajouté avant la conversion : un FLAC partiel doit aussi être nettoyé.
      created.push(audioPath(finalName));
      const started = performance.now();
      await alacToFlac(audioPath(storedName), audioPath(finalName));
      console.log(
        `[upload] ALAC converti en FLAC en ${Math.round(performance.now() - started)} ms : ${finalName}`,
      );
      mimeType = "audio/flac";
      transcodedFrom = "alac";
    } else {
      mimeType = STORED_MIME[meta.kind];
    }

    let cover: ProcessedAudio["cover"];
    if (extractCover && meta.picture) {
      cover = (await saveCover(meta.picture.data)) ?? undefined;
      if (cover) created.push(coverPath(cover.storedName));
    }
    console.log(`[upload] Pochette : ${cover ? cover.storedName : "aucune"}`);

    return {
      ok: true,
      audio: {
        storedName: finalName,
        mimeType,
        size: Bun.file(audioPath(finalName)).size,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        cover,
        transcodedFrom,
      },
    };
  } catch (error) {
    console.error(`[upload] Traitement impossible : ${storedName}`, error);
    await discardFiles(created);
    throw error;
  }
}
