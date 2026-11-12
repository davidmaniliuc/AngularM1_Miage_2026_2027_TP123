import { test, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import { BIOS_BYTES, Ps1Error, checkCue, cueFileCount, identifyDiscFile, inspectBios } from "../src/lib/ps1";
import { realBiosPath, syntheticDisc } from "./ps1-fixtures";

test("identifyDisc lit la région, le numéro et le titre d'une image", async () => {
  const file = path.join(os.tmpdir(), `gpc-disc-${crypto.randomUUID()}.bin`);
  await Bun.write(file, syntheticDisc());

  expect(await identifyDiscFile(file)).toEqual({
    title: "Croc - Legend of the Gobbos",
    region: "ntsc-u",
    serial: "SLUS-00530",
  });
});

test("un disque sans titre catalogué garde son volume", async () => {
  const file = path.join(os.tmpdir(), `gpc-disc-${crypto.randomUUID()}.bin`);
  await Bun.write(file, syntheticDisc("BOOT = cdrom:\\SLUS_999.99;1\r\n", "HOMEBREW"));

  const identity = await identifyDiscFile(file);
  expect(identity.title).toBe("HOMEBREW");
  expect(identity.serial).toBe("SLUS-99999");
});

test("un .cue à plusieurs fichiers est refusé avec MULTI_FILE_CUE", () => {
  const multi = 'FILE "a.bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "b.bin" BINARY\n  TRACK 02 AUDIO\n';
  expect(cueFileCount(multi)).toBe(2);
  expect(() => checkCue(multi)).toThrow(Ps1Error);
  expect(() => checkCue('FILE "a.bin" BINARY\n  TRACK 01 MODE2/2352\n')).not.toThrow();
});

test("un fichier qui n'a pas la taille d'un BIOS est refusé", async () => {
  const error = await inspectBios(new Uint8Array(1000)).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Ps1Error);
  expect((error as Ps1Error).code).toBe("BAD_BIOS_SIZE");
});

test("un BIOS de 512 Ko absent de la table est gardé comme non reconnu", async () => {
  expect(await inspectBios(new Uint8Array(BIOS_BYTES))).toMatchObject({ known: false, region: null });
});

test.skipIf(!realBiosPath)("un vrai BIOS est reconnu (PS1_BIOS)", async () => {
  const info = await inspectBios(await Bun.file(realBiosPath as string).bytes());
  expect(info.known).toBe(true);
  expect(info.region).not.toBeNull();
  expect(info.version).not.toBeNull();
});
