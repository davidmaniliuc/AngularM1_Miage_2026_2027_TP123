import path from "node:path";
import mongoose from "mongoose";
import { Game, type GameDoc } from "../models/Game";
import { saveCover } from "./covers";

const COVERS_SOURCE = path.join(import.meta.dir, "..", "..", "assets", "demo-covers");

/** Jeux fictifs de démonstration ; les pochettes sont générées par assets/demo-covers/generate.py. */
export const DEMO_GAMES: (Pick<GameDoc, "title" | "genre" | "region" | "year" | "favorite"> & {
  cover: string;
})[] = [
  { title: "Neon Drift", genre: "course", region: "pal", year: 2021, favorite: true, cover: "neon-drift" },
  { title: "Pixel Quest", genre: "rpg", region: "ntsc-u", year: 2022, favorite: true, cover: "pixel-quest" },
  { title: "Crystal Hopper", genre: "plateforme", region: "ntsc-u", year: 2020, favorite: false, cover: "crystal-hopper" },
  { title: "Void Raiders", genre: "action", region: "pal", year: 2023, favorite: false, cover: "void-raiders" },
  { title: "Lost Lighthouse", genre: "aventure", region: "ntsc-j", year: 2019, favorite: false, cover: "lost-lighthouse" },
  { title: "Brawl Arena 97", genre: "combat", region: "ntsc-u", year: 2024, favorite: false, cover: "brawl-arena-97" },
  { title: "Striker Cup", genre: "sport", region: "pal", year: 2022, favorite: false, cover: "striker-cup" },
  { title: "Block Matrix", genre: "puzzle", region: "ntsc-j", year: 2021, favorite: true, cover: "block-matrix" },
  { title: "Tactics Nova", genre: "strategie", region: "ntsc-u", year: 2025, favorite: false, cover: "tactics-nova" },
];

/**
 * Ajoute les jeux de démonstration à la bibliothèque d'un utilisateur.
 * Idempotent : un jeu dont le titre existe déjà chez lui n'est pas recréé.
 * Renvoie le nombre de jeux ajoutés.
 */
export async function seedDemoLibrary(ownerId: string): Promise<number> {
  const owner = new mongoose.Types.ObjectId(ownerId);
  const existing = new Set((await Game.find({ ownerId: owner }).select("title")).map((game) => game.title));
  let added = 0;

  for (const [index, demo] of DEMO_GAMES.entries()) {
    if (existing.has(demo.title)) continue;

    const { cover: coverName, ...fields } = demo;
    const data = new Uint8Array(await Bun.file(path.join(COVERS_SOURCE, `${coverName}.png`)).arrayBuffer());
    const cover = await saveCover(data);
    if (!cover) throw new Error(`Pochette de démonstration invalide : ${coverName}`);

    await Game.create({
      ...fields,
      ownerId: owner,
      coverStoredName: cover.storedName,
      coverMimeType: cover.mimeType,
      // Ordre d'ajout stable : le premier de la liste est le plus récent.
      createdAt: new Date(Date.now() - index * 1000),
    });
    added += 1;
  }

  console.log(`[demo] ${added} jeu(x) de démonstration ajouté(s)`);
  return added;
}
