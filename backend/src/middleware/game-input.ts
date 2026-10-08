import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types";

export interface GameInput {
  title?: string;
  description?: string | null;
  region?: string | null;
  releaseYear?: number | null;
}
export type GameEnv = { Variables: AppEnv["Variables"] & { gameInput: GameInput } };

/** Allow-list fields before they can enter a MongoDB update. Null clears optional metadata. */
export const validateGameInput = createMiddleware<GameEnv>(async (c, next) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    console.warn("[games] Corps JSON invalide");
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  }
  const invalid = (message: string): never => { throw new HTTPException(400, { message }); };
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("Objet JSON requis");
  const record = body as Record<string, unknown>;
  const allowed = ["title", "description", "region", "releaseYear"];
  if (!Object.keys(record).length || Object.keys(record).some(key => !allowed.includes(key))) {
    invalid("Champs de jeu invalides");
  }
  const input: GameInput = {};
  if (c.req.method === "POST" || "title" in record) {
    if (typeof record.title !== "string" || !record.title.trim() || record.title.trim().length > 200) {
      invalid("Le titre doit contenir entre 1 et 200 caractères");
    }
    input.title = (record.title as string).trim();
  }
  for (const [key, max] of [["description", 5000], ["region", 80]] as const) {
    if (!(key in record)) continue;
    const value = record[key];
    if (value !== null && (typeof value !== "string" || value.trim().length > max)) {
      invalid(`${key} doit être un texte de ${max} caractères maximum`);
    }
    input[key] = typeof value === "string" ? value.trim() || null : null;
  }
  if ("releaseYear" in record) {
    const year = record.releaseYear;
    if (year !== null && (typeof year !== "number" || !Number.isInteger(year) || year < 1900 || year > 2100)) {
      invalid("L’année doit être un entier entre 1900 et 2100");
    }
    input.releaseYear = year as number | null;
  }
  c.set("gameInput", input);
  await next();
});
