import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { User } from "../models/User";
import { createToken } from "../lib/jwt";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

/**
 * Lit le corps JSON d'une requête. Hono n'a pas d'équivalent global à
 * express.json() : c'est au handler de demander le corps, et un corps absent
 * ou mal formé doit produire une erreur 400 explicite.
 */
async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<
  Record<string, unknown>
> {
  try {
    const body = await c.req.json();
    return (body ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.warn("[auth] Corps JSON illisible", error);
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  }
}

/** Inscrit un utilisateur et renvoie un jeton avec ses données publiques. */
authRoutes.post("/register", async (c) => {
  const body = await readJson(c);
  const name = typeof body.name === "string" ? body.name : "";
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

  if (!name || !email || !password || password.length < 8) {
    console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
    throw new HTTPException(400, {
      message: "Nom, email et mot de passe de 8 caractères requis",
    });
  }

  // Vérifie que l'email est libre avant de créer le compte.
  if (await User.exists({ email: email.toLowerCase() })) {
    console.warn("[auth] Inscription refusée : email déjà utilisé");
    throw new HTTPException(409, { message: "Email déjà utilisé" });
  }

  const user = await User.register({ name, email, password });
  console.log(`[auth] Utilisateur créé : ${user.id}`);

  return c.json({ token: await createToken(user), user: user.toPublic() }, 201);
});

/** Vérifie les identifiants et ouvre une session JWT. */
authRoutes.post("/login", async (c) => {
  const body = await readJson(c);
  const email = (typeof body.email === "string" ? body.email : "").toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

  /*
   * passwordHash est marqué select:false dans le schéma : il faut le demander
   * explicitement pour pouvoir comparer le mot de passe.
   */
  const user = await User.findOne({ email }).select("+passwordHash");

  /*
   * Le même message est renvoyé pour un email inconnu et pour un mot de passe
   * faux : cela évite de révéler quels comptes existent.
   */
  if (!user || !(await user.verifyPassword(password))) {
    console.warn("[auth] Identifiants incorrects");
    throw new HTTPException(401, { message: "Identifiants incorrects" });
  }

  console.log(`[auth] Connexion réussie : ${user.id}`);
  return c.json({ token: await createToken(user), user: user.toPublic() });
});
