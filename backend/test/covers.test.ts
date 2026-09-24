import { test, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import {
  MAX_COVER_SIZE,
  coverPath,
  detectImageType,
  removeCover,
  saveCover,
} from "../src/lib/covers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { COVERS_DIR } from "../src/config";

beforeAll(ensureUploadsDir);

const bytes = (...values: number[]) => new Uint8Array(values);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);

test("ensureUploadsDir crée le dossier des pochettes", () => {
  expect(fs.existsSync(COVERS_DIR)).toBe(true);
});

test("detectImageType reconnaît JPEG, PNG et WebP par leurs octets", () => {
  expect(detectImageType(JPEG)).toBe("image/jpeg");
  expect(detectImageType(PNG)).toBe("image/png");
  expect(detectImageType(WEBP)).toBe("image/webp");
});

test("detectImageType refuse le reste", () => {
  expect(detectImageType(new Uint8Array(0))).toBeNull();
  expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
  expect(detectImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]))).toBeNull();
  expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
});

test("saveCover écrit sous un nom UUID et removeCover supprime", async () => {
  const saved = await saveCover(JPEG);
  expect(saved).not.toBeNull();
  expect(saved!.mimeType).toBe("image/jpeg");
  expect(saved!.storedName).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  expect(fs.existsSync(coverPath(saved!.storedName))).toBe(true);

  await removeCover(saved!.storedName);
  expect(fs.existsSync(coverPath(saved!.storedName))).toBe(false);
});

test("saveCover ignore une image inconnue sans lever d'erreur", async () => {
  expect(await saveCover(bytes(1, 2, 3))).toBeNull();
});

test("saveCover ignore une image de plus de 5 Mo", async () => {
  const big = new Uint8Array(MAX_COVER_SIZE + 1);
  big.set(JPEG);
  expect(await saveCover(big)).toBeNull();
});
