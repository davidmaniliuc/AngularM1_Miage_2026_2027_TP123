import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import { validateGameInput, type GameEnv } from "../middleware/game-input";
import { Game, publicGame } from "../models/Game";
import type { Page } from "../types";

export const gamesRoutes = new Hono<GameEnv>();
gamesRoutes.use("*", requireAuth);
gamesRoutes.use("*", async (c, next) => {
  if (!mongoose.isObjectIdOrHexString(c.get("auth").sub)) {
    throw new HTTPException(401, { message: "Authentification requise" });
  }
  await next();
});

function pageNumber(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number !== 0 ? Math.min(max, Math.max(1, number)) : fallback;
}
function owned(id: string, ownerId: string) {
  if (!mongoose.isObjectIdOrHexString(id)) throw missing();
  return { _id: id, ownerId };
}
function missing() { return new HTTPException(404, { message: "Jeu inconnu" }); }

gamesRoutes.get("/", async (c) => {
  const page = pageNumber(c.req.query("page"), 1, Math.floor(Number.MAX_SAFE_INTEGER / 20));
  const limit = pageNumber(c.req.query("limit"), 5, 20);
  const q = (c.req.query("q") ?? "").trim();
  if (q.length > 200) throw new HTTPException(400, { message: "Recherche limitée à 200 caractères" });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = { ownerId: c.get("auth").sub, ...(q ? { title: { $regex: escaped, $options: "i" } } : {}) };
  const [games, total] = await Promise.all([
    Game.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Game.countDocuments(filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / limit));
  const body: Page<ReturnType<typeof publicGame>> = {
    items: games.map(publicGame), page, limit, total, pages,
    pagingCounter: (page - 1) * limit + 1,
    hasPrevPage: page > 1, hasNextPage: page < pages,
    prevPage: page > 1 ? page - 1 : null, nextPage: page < pages ? page + 1 : null,
  };
  return c.json(body);
});

gamesRoutes.post("/", validateGameInput, async (c) => {
  const input = Object.fromEntries(Object.entries(c.get("gameInput")).filter(([, value]) => value !== null));
  const game = await Game.create({ ...input, ownerId: c.get("auth").sub });
  console.log(`[games] Jeu créé : ${game.id}`);
  return c.json(publicGame(game), 201);
});

gamesRoutes.get("/:id", async (c) => {
  const game = await Game.findOne(owned(c.req.param("id"), c.get("auth").sub)).lean();
  if (!game) throw missing();
  return c.json(publicGame(game));
});

gamesRoutes.patch("/:id", validateGameInput, async (c) => {
  const entries = Object.entries(c.get("gameInput"));
  const game = await Game.findOneAndUpdate(owned(c.req.param("id"), c.get("auth").sub), {
    $set: Object.fromEntries(entries.filter(([, value]) => value !== null)),
    $unset: Object.fromEntries(entries.filter(([, value]) => value === null).map(([key]) => [key, 1])),
  }, { returnDocument: 'after', runValidators: true }).lean();
  if (!game) throw missing();
  console.log(`[games] Jeu modifié : ${game._id}`);
  return c.json(publicGame(game));
});

gamesRoutes.delete("/:id", async (c) => {
  const game = await Game.findOneAndDelete(owned(c.req.param("id"), c.get("auth").sub));
  if (!game) throw missing();
  console.log(`[games] Jeu supprimé : ${game.id}`);
  return c.body(null, 204);
});
