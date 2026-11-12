import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import {
  Game,
  MAX_YEAR,
  MIN_YEAR,
  SERIAL_PATTERN,
  isGenre,
  isRegion,
  type GameDoc,
} from "../models/Game";
import { coverPath, removeCover, saveCover } from "../lib/covers";
import type { AppEnv, Page } from "../types";

export const gamesRoutes = new Hono<AppEnv>();

gamesRoutes.use("*", requireAuth);

const notFound = () => new HTTPException(404, { message: "Jeu inconnu" });

type Body = Record<string, string | File | (string | File)[]>;

/** Valeur texte d'un champ de formulaire, ou undefined s'il est absent. */
function text(body: Body, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Valide les champs texte du formulaire. Un champ absent reste inchangé ;
 * serial et genre vides sont effacés. `partial` autorise l'absence de titre
 * (PATCH) ; sinon le titre est obligatoire (POST).
 */
function parseFields(body: Body, partial: boolean) {
  const fields: Partial<Pick<GameDoc, "title" | "serial" | "genre" | "region" | "year" | "favorite">> & {
    unset: ("serial" | "genre" | "region" | "year")[];
  } = { unset: [] };

  const title = text(body, "title");
  if (title !== undefined) {
    if (!title) throw new HTTPException(400, { message: "Le titre est obligatoire" });
    fields.title = title;
  } else if (!partial) {
    throw new HTTPException(400, { message: "Le titre est obligatoire" });
  }

  const serial = text(body, "serial")?.toUpperCase();
  if (serial === "") {
    fields.unset.push("serial");
  } else if (serial !== undefined) {
    if (!SERIAL_PATTERN.test(serial)) {
      throw new HTTPException(400, { message: "Numéro de série invalide (ex. SCUS-94163)" });
    }
    fields.serial = serial;
  }

  const genre = text(body, "genre");
  if (genre === "") {
    fields.unset.push("genre");
  } else if (genre !== undefined) {
    if (!isGenre(genre)) throw new HTTPException(400, { message: "Genre inconnu" });
    fields.genre = genre;
  }

  const region = text(body, "region");
  if (region === "") {
    fields.unset.push("region");
  } else if (region !== undefined) {
    if (!isRegion(region)) throw new HTTPException(400, { message: "Région inconnue" });
    fields.region = region;
  }

  const year = text(body, "year");
  if (year === "") {
    fields.unset.push("year");
  } else if (year !== undefined) {
    const value = Number(year);
    if (!Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) {
      throw new HTTPException(400, { message: `Année invalide (${MIN_YEAR} à ${MAX_YEAR})` });
    }
    fields.year = value;
  }

  const favorite = text(body, "favorite");
  if (favorite !== undefined) {
    if (favorite !== "true" && favorite !== "false") {
      throw new HTTPException(400, { message: "favorite doit valoir true ou false" });
    }
    fields.favorite = favorite === "true";
  }

  return fields;
}

/** Enregistre le fichier "cover" du formulaire ; une image refusée est une erreur 400. */
async function readCover(body: Body) {
  const file = body["cover"];
  if (!(file instanceof File) || file.size === 0) return null;

  const saved = await saveCover(new Uint8Array(await file.arrayBuffer()));
  if (!saved) {
    throw new HTTPException(400, { message: "Pochette invalide (JPEG, PNG ou WebP, 5 Mo maximum)" });
  }
  return saved;
}

/** Supprime une pochette ; l'échec est journalisé sans changer la réponse. */
async function discardCover(storedName: string | undefined): Promise<void> {
  if (!storedName) return;
  try {
    await removeCover(storedName);
  } catch (error) {
    console.error(`[games] Pochette non supprimée : ${storedName}`, error);
  }
}

/** Champs de tri acceptés par GET /games, associés au champ MongoDB. */
const SORT_FIELDS = { title: "title", year: "year", added: "createdAt" } as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Liste mes jeux, paginés. Filtres : q (titre ou série), region, genre,
 * favorite=true. Tri : sort=title|year|added, order=asc|desc (défaut : added,
 * du plus récent au plus ancien). Une valeur de filtre inconnue est une 400 ;
 * page, limit, sort et order inconnus retombent sur leur défaut.
 */
gamesRoutes.get("/", async (c) => {
  const { sub } = c.get("auth");
  const page = Math.max(1, Math.floor(Number(c.req.query("page"))) || 1);
  const limit = Math.min(60, Math.max(1, Math.floor(Number(c.req.query("limit"))) || 24));

  const filter: mongoose.QueryFilter<GameDoc> = { ownerId: sub };

  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: pattern }, { serial: pattern }];
  }

  const region = c.req.query("region");
  if (region) {
    if (!isRegion(region)) throw new HTTPException(400, { message: "Région inconnue" });
    filter.region = region;
  }

  const genre = c.req.query("genre");
  if (genre) {
    if (!isGenre(genre)) throw new HTTPException(400, { message: "Genre inconnu" });
    filter.genre = genre;
  }

  if (c.req.query("favorite") === "true") filter.favorite = true;

  const sortKey = c.req.query("sort") as keyof typeof SORT_FIELDS;
  const sortField = SORT_FIELDS[sortKey] ?? "createdAt";
  const direction = c.req.query("order") === "asc" ? 1 : c.req.query("order") === "desc" ? -1 : sortField === "title" ? 1 : -1;

  const total = await Game.countDocuments(filter);
  const games = await Game.find(filter)
    .select("+coverStoredName")
    .collation({ locale: "fr", strength: 2 })
    .sort({ [sortField]: direction, _id: direction })
    .skip((page - 1) * limit)
    .limit(limit);

  const pages = Math.max(1, Math.ceil(total / limit));
  const body: Page<ReturnType<(typeof games)[number]["toPublic"]>> = {
    items: games.map((game) => game.toPublic()),
    page,
    limit,
    total,
    pages,
    pagingCounter: (page - 1) * limit + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < pages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < pages ? page + 1 : null,
  };
  console.log(`[games] ${body.items.length} jeu(x) envoyé(s) sur ${total} à ${sub}`);
  return c.json(body);
});

/** Crée un jeu. Multipart : title, serial, genre, cover (tous facultatifs sauf title). */
gamesRoutes.post("/", async (c) => {
  const { sub } = c.get("auth");
  const body = (await c.req.parseBody()) as Body;
  const fields = parseFields(body, false);
  const cover = await readCover(body);

  try {
    const game = await Game.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      title: fields.title,
      serial: fields.serial,
      genre: fields.genre,
      region: fields.region,
      year: fields.year,
      favorite: fields.favorite ?? false,
      coverStoredName: cover?.storedName,
      coverMimeType: cover?.mimeType,
    });
    console.log(`[games] Jeu créé : ${game.id}`);
    return c.json(game.toPublic(), 201);
  } catch (error) {
    await discardCover(cover?.storedName);
    throw error;
  }
});

/** Fiche d'un de mes jeux. */
gamesRoutes.get("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const game = await Game.findOne({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!game) throw notFound();
  return c.json(game.toPublic());
});

/**
 * Modifie un de mes jeux. Multipart : title, serial, genre, cover (nouvelle
 * pochette) et removeCover=true (retire la pochette). Les champs absents
 * ne changent pas.
 */
gamesRoutes.patch("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const body = (await c.req.parseBody()) as Body;
  const fields = parseFields(body, true);
  const cover = await readCover(body);
  const removeCurrent = text(body, "removeCover") === "true";

  const existing = await Game.findOne({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!existing) {
    await discardCover(cover?.storedName);
    throw notFound();
  }

  const { unset, ...values } = fields;
  const update: mongoose.UpdateQuery<GameDoc> = {
    $set: { ...values },
    $unset: Object.fromEntries(unset.map((key) => [key, ""])),
  };
  if (cover) {
    update.$set = { ...update.$set, coverStoredName: cover.storedName, coverMimeType: cover.mimeType };
  } else if (removeCurrent) {
    update.$unset = { ...update.$unset, coverStoredName: "", coverMimeType: "" };
  }

  try {
    const game = await Game.findOneAndUpdate({ _id: id, ownerId: sub }, update, {
      new: true,
      runValidators: true,
    }).select("+coverStoredName");
    if (!game) throw notFound();

    if (cover || removeCurrent) await discardCover(existing.coverStoredName);
    console.log(`[games] Jeu modifié : ${id}`);
    return c.json(game.toPublic());
  } catch (error) {
    await discardCover(cover?.storedName);
    throw error;
  }
});

/** Envoie la pochette d'un de mes jeux. */
gamesRoutes.get("/:id/cover", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  const missing = () => new HTTPException(404, { message: "Pochette inconnue" });
  if (!mongoose.isValidObjectId(id)) throw missing();

  const game = await Game.findOne({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!game?.coverStoredName || !game.coverMimeType) throw missing();

  const file = Bun.file(coverPath(game.coverStoredName));
  if (!(await file.exists())) {
    console.error(`[games] Pochette absente du disque pour le jeu ${game.id}`);
    throw missing();
  }

  c.header("Content-Type", game.coverMimeType);
  c.header("Content-Length", String(file.size));
  c.header("Cache-Control", "private, max-age=86400");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(file.stream());
});

/** Supprime un de mes jeux et sa pochette. */
gamesRoutes.delete("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const game = await Game.findOneAndDelete({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!game) throw notFound();

  await discardCover(game.coverStoredName);
  return c.body(null, 204);
});
