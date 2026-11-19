import { BIOS_BYTES, Ps1Core, Ps1Error, identifyDisc, type BiosInfo } from "@davidmaniliuc/substation";
import type { Region } from "../models/Game";

/*
 * Accès au cœur d'émulation PS1 (@davidmaniliuc/substation). Ps1Core ne
 * dépend pas du navigateur : Bun charge le même .wasm que le frontend.
 */

export { BIOS_BYTES, Ps1Error };

/** Régions de la bibliothèque vers celles du modèle Game. */
const REGIONS: Record<string, Region> = { america: "ntsc-u", japan: "ntsc-j", europe: "pal" };

/** Messages affichés pour chaque refus du cœur ; les autres codes gardent un message générique. */
const MESSAGES: Partial<Record<string, string>> = {
  BAD_BIOS_SIZE: `Ce fichier n'est pas un BIOS PS1 (il doit faire exactement ${BIOS_BYTES / 1024} Ko)`,
  BAD_CHD: "Fichier .chd illisible",
  BAD_CUE: "Image disque illisible",
  MULTI_FILE_CUE:
    "Ce .cue référence plusieurs fichiers .bin : convertissez le jeu en .chd (chdman createcd) ou fusionnez ses pistes en un seul .bin",
};

/** Message français d'un refus du cœur. */
export function ps1Message(error: Ps1Error): string {
  return MESSAGES[error.code] ?? `Fichier refusé par l'émulateur (${error.code})`;
}

export interface DiscIdentity {
  title?: string;
  region?: Region;
  serial?: string;
}

/**
 * Lit la région, le numéro de série et le titre catalogué d'une image
 * (.chd ou .bin). identifyDisc travaille dans une instance du cœur créée
 * pour l'occasion, libérée avec l'image qu'elle a reçue.
 */
export async function identifyDiscFile(filePath: string): Promise<DiscIdentity> {
  const info = await identifyDisc(Bun.file(filePath));
  return {
    title: info.title ?? info.set?.title ?? (info.volumeId.trim() || undefined),
    region: info.region ? REGIONS[info.region] : undefined,
    serial: info.serial || undefined,
  };
}

/** Nombre de lignes FILE d'un .cue : au-delà d'une, les .bin devraient être concaténés. */
export function cueFileCount(cue: string): number {
  return cue.split(/\r?\n/).filter((line) => /^\s*FILE\s/i.test(line)).length;
}

/** Refuse un .cue à plusieurs fichiers, comme le ferait loadDisc. */
export function checkCue(cue: string): void {
  if (cueFileCount(cue) > 1) throw new Ps1Error("MULTI_FILE_CUE");
}

// loadBios a besoin d'une machine complète : une seule est créée, à la demande.
let biosCore: Promise<Ps1Core> | undefined;

/** Vérifie un BIOS : région, version et s'il figure dans la table du cœur. */
export async function inspectBios(bytes: Uint8Array): Promise<BiosInfo> {
  // Le cœur refuserait aussi la taille, mais sans avoir à démarrer une machine.
  if (bytes.byteLength !== BIOS_BYTES) throw new Ps1Error("BAD_BIOS_SIZE");
  biosCore ??= Ps1Core.create(undefined, { onLog: () => {} });
  return (await biosCore).loadBios(bytes);
}
