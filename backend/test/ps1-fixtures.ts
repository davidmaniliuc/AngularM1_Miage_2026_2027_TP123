/*
 * Images PS1 fabriquées en mémoire pour les tests : aucun vrai jeu ni BIOS
 * (protégés par le droit d'auteur) n'est versionné.
 */

const SECTOR = 2352;

/**
 * Le plus petit disque que identifyDisc sait lire : zone de licence au
 * secteur 4, descripteur de volume au 16, répertoire racine au 22 et
 * SYSTEM.CNF au 30. Repris des tests de @davidmaniliuc/substation ; le
 * numéro SLUS-00530 est celui de Croc, présent dans son catalogue.
 */
export function syntheticDisc(
  systemCnf = "BOOT = cdrom:\\SLUS_005.30;1\r\nTCB = 4\r\n",
  volumeId = "CROC",
): Uint8Array<ArrayBuffer> {
  const image = new Uint8Array(SECTOR * 40);
  const ascii = (s: string) => new TextEncoder().encode(s);
  // Secteurs en mode 2 : les données commencent 24 octets après le début.
  const writeSector = (lba: number, payload: Uint8Array) => {
    image[lba * SECTOR + 15] = 2;
    image.set(payload, lba * SECTOR + 24);
  };
  const dirRecord = (out: Uint8Array, at: number, extent: number, length: number, name: Uint8Array) => {
    const size = 33 + name.length + ((name.length + 1) % 2);
    const view = new DataView(out.buffer, out.byteOffset + at);
    out[at] = size;
    view.setUint32(2, extent, true);
    view.setUint32(10, length, true);
    out[at + 32] = name.length;
    out.set(name, at + 33);
    return size;
  };

  writeSector(4, ascii("          Licensed  by          Sony Computer Entertainment Amer  ica "));

  const pvd = new Uint8Array(2048);
  pvd[0] = 1;
  pvd.set(ascii("CD001"), 1);
  pvd[6] = 1;
  pvd.fill(0x20, 40, 72);
  pvd.set(ascii(volumeId), 40);
  dirRecord(pvd, 156, 22, 2048, new Uint8Array([0]));
  writeSector(16, pvd);

  const cnf = ascii(systemCnf);
  const rootDir = new Uint8Array(2048);
  let at = 0;
  at += dirRecord(rootDir, at, 22, 2048, new Uint8Array([0]));
  at += dirRecord(rootDir, at, 22, 2048, new Uint8Array([1]));
  dirRecord(rootDir, at, 30, cnf.length, ascii("SYSTEM.CNF;1"));
  writeSector(22, rootDir);
  writeSector(30, cnf);
  return image;
}

/**
 * Chemin d'un vrai BIOS (512 Ko) pour les tests qui en ont besoin, fourni
 * par la variable PS1_BIOS. Sans elle, ces tests sont ignorés.
 */
export const realBiosPath = process.env.PS1_BIOS;
