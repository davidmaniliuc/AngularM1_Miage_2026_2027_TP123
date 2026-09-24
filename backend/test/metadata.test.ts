import { test, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import { kindOf, readMetadata, type AudioKind } from "../src/lib/metadata";

const fixture = (name: string) => path.join(import.meta.dir, "fixtures", name);

/*
 * Les chaînes container/codec ont été relevées sur les fixtures avec
 * music-metadata 11.16.0. Si une mise à jour de la librairie les change,
 * ces tests le signalent.
 */
test.each<[string, AudioKind]>([
  ["alac-cover.m4a", "alac"],
  ["alac-nocover.m4a", "alac"],
  ["aac.m4a", "aac"],
  ["aac-isom.m4a", "aac"],
  ["flac-cover.flac", "flac"],
  ["plain.mp3", "mp3"],
  ["plain.wav", "wav"],
  ["plain.ogg", "ogg"],
])("%s est reconnu comme %s", async (name, kind) => {
  expect((await readMetadata(fixture(name))).kind).toBe(kind);
});

test("un fichier texte renommé en .m4a n'est pas de l'audio", async () => {
  expect((await readMetadata(fixture("not-audio.m4a"))).kind).toBeNull();
});

test("un fichier absent n'est pas de l'audio", async () => {
  expect((await readMetadata(fixture("absent.mp3"))).kind).toBeNull();
});

test("des zéros étiquetés MP3 ne sont pas de l'audio", async () => {
  const zeros = path.join(os.tmpdir(), `gpc-zeros-${process.pid}.mp3`);
  await Bun.write(zeros, new Uint8Array(2048));
  try {
    expect((await readMetadata(zeros)).kind).toBeNull();
  } finally {
    await Bun.file(zeros).delete();
  }
});

test("tags et pochette JPEG d'un ALAC", async () => {
  const meta = await readMetadata(fixture("alac-cover.m4a"));
  expect(meta.title).toBe("Sinus");
  expect(meta.artist).toBe("Testeur");
  expect(meta.album).toBe("Fixtures");
  expect(meta.picture?.format).toBe("image/jpeg");
  expect(Array.from(meta.picture!.data.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
});

test("pochette PNG d'un FLAC", async () => {
  const meta = await readMetadata(fixture("flac-cover.flac"));
  expect(meta.picture?.format).toBe("image/png");
});

test("un fichier sans tags n'a ni titre ni pochette", async () => {
  const meta = await readMetadata(fixture("plain.mp3"));
  expect(meta.title).toBeUndefined();
  expect(meta.artist).toBeUndefined();
  expect(meta.picture).toBeUndefined();
});

test("kindOf refuse les combinaisons inconnues", () => {
  expect(kindOf(undefined, undefined)).toBeNull();
  expect(kindOf("MPEG", undefined)).toBeNull();
  expect(kindOf("Matroska", "Vorbis I")).toBeNull();
  expect(kindOf("M4A/mp42/isom", "ALAC")).toBe("alac");
  expect(kindOf("MPEG-4/isom", "MPEG-4/AAC")).toBe("aac");
  // La marque MP4 varie selon l'outil : seul le codec compte.
  expect(kindOf("isom/iso2/mp41", "MPEG-4/AAC")).toBe("aac");
  expect(kindOf("mp42/iso2/mp41", "MPEG-4/AAC")).toBe("aac");
  // AAC hors conteneur MP4 : ce ne serait pas de l'audio/mp4.
  expect(kindOf("ADTS/MPEG-4", "AAC")).toBeNull();
  expect(kindOf("EBML/matroska", "AAC")).toBeNull();
});
