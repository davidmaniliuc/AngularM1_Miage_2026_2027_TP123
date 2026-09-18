import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth";
import { User } from "../models/User";
import type { AppEnv } from "../types";

export const usersRoutes = new Hono<AppEnv>();

// Toutes les routes de ce module exigent un jeton valide.
usersRoutes.use("*", requireAuth);

/** Retourne le profil public de l'utilisateur identifié par le jeton. */
usersRoutes.get("/me", async (c) => {
  // c.get("auth") contient ce que le middleware requireAuth a déposé.
  const { sub } = c.get("auth");
  const user = await User.findById(sub);

  if (!user) {
    console.warn(`[user] Profil introuvable : ${sub}`);
    throw new HTTPException(404, { message: "Utilisateur inconnu" });
  }

  console.log(`[user] Profil envoyé : ${user.id}`);
  return c.json(user.toPublic());
});

/**
 * Modifie uniquement le nom de l'utilisateur connecté.
 * Seul le champ `name` est repris du corps : un client ne doit pas pouvoir
 * changer son email ou son mot de passe par cette route.
 */
usersRoutes.put("/me", async (c) => {
  const { sub } = c.get("auth");

  let body: Record<string, unknown>;
  try {
    body = ((await c.req.json()) ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.warn("[user] Corps JSON illisible", error);
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  }

  const name = typeof body.name === "string" ? body.name : undefined;

  // runValidators applique les règles du schéma (longueur minimale du nom)
  // à une mise à jour, ce que Mongoose ne fait pas par défaut.
  const user = await User.findByIdAndUpdate(
    sub,
    { $set: { name } },
    { returnDocument: "after", runValidators: true },
  );

  if (!user) {
    console.warn(`[user] Mise à jour impossible : ${sub}`);
    throw new HTTPException(404, { message: "Utilisateur inconnu" });
  }

  console.log(`[user] Nom mis à jour : ${user.id}`);
  return c.json(user.toPublic());
});
