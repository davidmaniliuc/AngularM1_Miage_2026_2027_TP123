import { test, expect, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { alacToFlac } from "../src/lib/transcode";
import { readMetadata } from "../src/lib/metadata";

const fixture = (name: string) => path.join(import.meta.dir, "fixtures", name);
const output = path.join(os.tmpdir(), `gpc-transcode-${process.pid}.flac`);

afterEach(() => fsPromises.rm(output, { force: true }));

test("ALAC → FLAC conserve les tags et la pochette", async () => {
  await alacToFlac(fixture("alac-cover.m4a"), output);

  const meta = await readMetadata(output);
  expect(meta.kind).toBe("flac");
  expect(meta.title).toBe("Sinus");
  expect(meta.artist).toBe("Testeur");
  expect(meta.picture?.format).toBe("image/jpeg");
});

test("un ALAC sans pochette se convertit aussi", async () => {
  await alacToFlac(fixture("alac-nocover.m4a"), output);

  const meta = await readMetadata(output);
  expect(meta.kind).toBe("flac");
  expect(meta.picture).toBeUndefined();
});

test("une source invalide donne une erreur avec le message de ffmpeg", async () => {
  await expect(alacToFlac(fixture("not-audio.m4a"), output)).rejects.toThrow(/^ffmpeg a échoué/);
});

test("ffmpeg absent donne une erreur explicite", async () => {
  await expect(
    alacToFlac(fixture("alac-cover.m4a"), output, { ffmpeg: "ffmpeg-introuvable" }),
  ).rejects.toThrow("ffmpeg n'est pas installé");
});

test("au-delà du délai, ffmpeg est interrompu", async () => {
  await expect(
    alacToFlac(fixture("alac-cover.m4a"), output, { timeoutMs: 1 }),
  ).rejects.toThrow(/^ffmpeg interrompu/);
});
