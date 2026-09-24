import mongoose from "mongoose";
import { MONGODB_URI } from "../src/config";
import { Track } from "../src/models/Track";
import { audioPath, discardFiles, ensureUploadsDir } from "../src/lib/uploads";
import { createdFiles, processAudio } from "../src/lib/ingest";

export interface MigrationReport {
  converted: number;
  coversAdded: number;
  tagsAdded: number;
  skipped: number;
  failed: number;
}

/**
 * Applique aux pistes déjà en base le traitement de l'upload : conversion
 * ALAC → FLAC, extraction de la pochette, lecture de artist et album.
 * Le titre choisi par l'utilisateur n'est jamais modifié.
 *
 * Idempotent : un FLAC n'est pas reconverti, une pochette présente n'est pas
 * réextraite, un tag déjà renseigné n'est pas écrasé.
 */
export async function migrateMedia(): Promise<MigrationReport> {
  const report: MigrationReport = { converted: 0, coversAdded: 0, tagsAdded: 0, skipped: 0, failed: 0 };
  const tracks = await Track.find().select("+storedName +coverStoredName");

  for (const track of tracks) {
    const originalName = track.storedName;

    if (!(await Bun.file(audioPath(originalName)).exists())) {
      console.warn(`[migration] Fichier absent, piste ignorée : ${track.id}`);
      report.skipped += 1;
      continue;
    }

    try {
      const result = await processAudio(originalName, {
        extractCover: !track.coverStoredName,
      });

      if (!result.ok) {
        console.warn(`[migration] Format non reconnu, piste ignorée : ${track.id}`);
        report.skipped += 1;
        continue;
      }

      const { audio } = result;

      if (audio.transcodedFrom) {
        track.storedName = audio.storedName;
        track.mimeType = audio.mimeType;
        track.size = audio.size;
        track.transcodedFrom = audio.transcodedFrom;
      }
      if (audio.cover) {
        track.coverStoredName = audio.cover.storedName;
        track.coverMimeType = audio.cover.mimeType;
      }
      const addsTags =
        (!track.artist && !!audio.artist) || (!track.album && !!audio.album);
      if (!track.artist && audio.artist) track.artist = audio.artist;
      if (!track.album && audio.album) track.album = audio.album;

      if (!track.isModified()) continue;

      try {
        await track.save();
      } catch (error) {
        await discardFiles(createdFiles(audio, originalName));
        throw error;
      }

      if (audio.transcodedFrom) report.converted += 1;
      if (audio.cover) report.coversAdded += 1;
      if (addsTags) report.tagsAdded += 1;

      // L'ancien fichier n'est supprimé qu'une fois la base à jour.
      if (audio.storedName !== originalName) {
        await discardFiles([audioPath(originalName)]);
      }
      console.log(`[migration] Piste mise à jour : ${track.id}`);
    } catch (error) {
      console.error(`[migration] Échec pour la piste ${track.id}`, error);
      report.failed += 1;
    }
  }

  return report;
}

// Exécuté seulement avec `bun run scripts/migrate-media.ts`, pas à l'import.
if (import.meta.main) {
  if (!MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");

  ensureUploadsDir();
  await mongoose.connect(MONGODB_URI);
  const report = await migrateMedia();
  console.log("[migration] Bilan", report);
  await mongoose.disconnect();
  process.exit(report.failed > 0 ? 1 : 0);
}
