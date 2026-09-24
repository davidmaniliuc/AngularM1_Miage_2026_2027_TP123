import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { audioPath, ensureUploadsDir } from "../src/lib/uploads";
import { coverPath } from "../src/lib/covers";
import { Track } from "../src/models/Track";
import { migrateMedia } from "../scripts/migrate-media";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

/** Copie une fixture dans UPLOADS_DIR et crée la piste « ancienne » correspondante. */
async function seedLegacy(fixture: string, mimeType: string) {
  const storedName = `${crypto.randomUUID()}${path.extname(fixture)}`;
  fs.copyFileSync(path.join(import.meta.dir, "fixtures", fixture), audioPath(storedName));
  return Track.create({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Titre choisi",
    originalName: fixture,
    storedName,
    mimeType,
    size: fs.statSync(audioPath(storedName)).size,
  });
}

test("convertit un ALAC existant, ajoute pochette et tags, garde le titre", async () => {
  const legacy = await seedLegacy("alac-cover.m4a", "audio/x-m4a");
  const oldPath = audioPath(legacy.storedName);

  const report = await migrateMedia();
  expect(report).toEqual({ converted: 1, coversAdded: 1, tagsAdded: 1, skipped: 0, failed: 0 });

  const track = await Track.findById(legacy.id).select("+storedName +coverStoredName");
  expect(track!.title).toBe("Titre choisi");
  expect(track!.mimeType).toBe("audio/flac");
  expect(track!.transcodedFrom).toBe("alac");
  expect(track!.artist).toBe("Testeur");
  expect(track!.storedName).toEndWith(".flac");
  expect(track!.size).toBe(fs.statSync(audioPath(track!.storedName)).size);
  expect(fs.existsSync(coverPath(track!.coverStoredName!))).toBe(true);
  expect(fs.existsSync(oldPath)).toBe(false);
});

test("un second passage ne change rien", async () => {
  await seedLegacy("alac-cover.m4a", "audio/x-m4a");
  await migrateMedia();
  const before = await Track.findOne().select("+storedName +coverStoredName").lean();

  const report = await migrateMedia();
  expect(report).toEqual({ converted: 0, coversAdded: 0, tagsAdded: 0, skipped: 0, failed: 0 });

  const after = await Track.findOne().select("+storedName +coverStoredName").lean();
  expect(after).toEqual(before);
  expect(fs.existsSync(audioPath(after!.storedName))).toBe(true);
});

test("fichier audio absent : piste ignorée", async () => {
  await Track.create({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Fantôme",
    originalName: "x.mp3",
    storedName: "absent.mp3",
    mimeType: "audio/mpeg",
    size: 1,
  });

  const report = await migrateMedia();
  expect(report.skipped).toBe(1);
  expect(report.failed).toBe(0);
});
