import { test, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import {
  ensureUploadsDir,
  validateAudio,
  saveAudio,
  removeAudio,
  audioPath,
} from "../src/lib/uploads";
import { MAX_FILE_SIZE } from "../src/config";

beforeAll(ensureUploadsDir);

function audioFile(name: string, type: string, size = 16): File {
  return new File([new Uint8Array(size)], name, { type });
}

test("un champ absent est refusé", () => {
  const result = validateAudio(undefined);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Fichier audio requis");
});

test("une chaîne de texte n'est pas un fichier", () => {
  const result = validateAudio("song.mp3");
  expect(result.ok).toBe(false);
});

test("un type MIME non audio est refusé", () => {
  const result = validateAudio(audioFile("x.exe", "application/octet-stream"));
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Format audio non accepté");
});

test("un fichier trop volumineux est refusé", () => {
  const result = validateAudio(audioFile("big.mp3", "audio/mpeg", MAX_FILE_SIZE + 1));
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Fichier trop volumineux");
});

test("un mp3 valide est accepté", () => {
  expect(validateAudio(audioFile("ok.mp3", "audio/mpeg")).ok).toBe(true);
});

test("saveAudio écrit le fichier sous un nom aléatoire et removeAudio le supprime", async () => {
  const storedName = await saveAudio(audioFile("Chanson Été.MP3", "audio/mpeg", 128));

  expect(storedName).toEndWith(".mp3");
  expect(storedName).not.toContain("Chanson");
  expect(fs.existsSync(audioPath(storedName))).toBe(true);
  expect(Bun.file(audioPath(storedName)).size).toBe(128);

  await removeAudio(storedName);
  expect(fs.existsSync(audioPath(storedName))).toBe(false);
});
