import crypto from "node:crypto";
import path from "node:path";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import { Game } from "../models/Game";
import { GameSave, SAVE_KINDS, type SaveKind } from "../models/GameSave";
import { MAX_STATE_BYTES, MEMCARD_BYTES, SAVES_DIR } from "../config";
import { discardFiles } from "../lib/uploads";
import type { AppEnv } from "../types";

/*
 * Cartes mémoire et sauvegardes rapides d'un de mes jeux :
 * /api/games/:id/saves/memcard et /api/games/:id/saves/state.
 * Le corps est le fichier lui-même (application/octet-stream).
 */
export const savesRoutes = new Hono<AppEnv>();

savesRoutes.use("*", requireAuth);

const savePath = (storedName: string) => path.join(SAVES_DIR, storedName);

/** Supprime les sauvegardes d'un jeu (appelé quand le jeu est supprimé). */
export async function discardSaves(gameId: string): Promise<void> {
  const saves = await GameSave.find({ gameId });
  await GameSave.deleteMany({ gameId });
  await discardFiles(saves.map((save) => savePath(save.storedName)));
}

function register(kind: SaveKind) {
  const label = kind === "memcard" ? "Carte mémoire" : "Sauvegarde rapide";
  const missing = () => new HTTPException(404, { message: `${label} inconnue` });
  const url = `/:id/saves/${kind}`;

  /** Le jeu doit exister et m'appartenir. */
  async function ownedGame(c: { req: { param(name: string): string }; get(key: "auth"): { sub: string } }) {
    const id = c.req.param("id");
    if (!mongoose.isValidObjectId(id)) throw new HTTPException(404, { message: "Jeu inconnu" });
    const game = await Game.findOne({ _id: id, ownerId: c.get("auth").sub }).select("_id");
    if (!game) throw new HTTPException(404, { message: "Jeu inconnu" });
    return game;
  }

  savesRoutes.get(url, async (c) => {
    const game = await ownedGame(c);
    const save = await GameSave.findOne({ ownerId: c.get("auth").sub, gameId: game._id, kind });
    if (!save) throw missing();

    const file = Bun.file(savePath(save.storedName));
    if (!(await file.exists())) {
      console.error(`[saves] Fichier absent du disque pour ${kind} du jeu ${game.id}`);
      throw missing();
    }
    c.header("Content-Type", "application/octet-stream");
    c.header("Content-Length", String(file.size));
    c.header("Cache-Control", "private, no-store");
    return c.body(file.stream());
  });

  savesRoutes.put(url, async (c) => {
    const { sub } = c.get("auth");
    const game = await ownedGame(c);

    const limit = kind === "memcard" ? MEMCARD_BYTES : MAX_STATE_BYTES;
    const declared = Number(c.req.header("Content-Length"));
    if (Number.isFinite(declared) && declared > limit) {
      throw new HTTPException(413, { message: `${label} trop volumineuse` });
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (kind === "memcard" ? bytes.byteLength !== MEMCARD_BYTES : bytes.byteLength === 0 || bytes.byteLength > limit) {
      throw new HTTPException(400, {
        message: kind === "memcard" ? "Une carte mémoire fait exactement 128 Ko" : "Sauvegarde rapide vide ou trop volumineuse",
      });
    }

    const storedName = `${crypto.randomUUID()}.bin`;
    await Bun.write(savePath(storedName), bytes);
    try {
      const previous = await GameSave.findOneAndUpdate(
        { ownerId: sub, gameId: game._id, kind },
        { storedName, size: bytes.byteLength },
        { upsert: true, new: false },
      );
      if (previous) await discardFiles([savePath(previous.storedName)]);
    } catch (error) {
      await discardFiles([savePath(storedName)]);
      throw error;
    }
    console.log(`[saves] ${kind} enregistrée : jeu ${game.id} (${bytes.byteLength} octets)`);
    return c.body(null, 204);
  });

  savesRoutes.delete(url, async (c) => {
    const game = await ownedGame(c);
    const save = await GameSave.findOneAndDelete({ ownerId: c.get("auth").sub, gameId: game._id, kind });
    if (!save) throw missing();
    await discardFiles([savePath(save.storedName)]);
    return c.body(null, 204);
  });
}

for (const kind of SAVE_KINDS) register(kind);
