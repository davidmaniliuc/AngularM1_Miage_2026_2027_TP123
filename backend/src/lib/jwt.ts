import { sign, verify } from "hono/jwt";
import { JWT_ALG, JWT_SECRET, TOKEN_TTL_SECONDS } from "../config";
import type { AuthPayload } from "../types";

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'y figure jamais. `sub` signifie subject et contient
 * l'identifiant MongoDB de l'utilisateur.
 */
export async function createToken(user: {
  id: string;
  email: string;
}): Promise<string> {
  console.log(`[auth] Création d'un jeton pour l'utilisateur ${user.id}`);

  return sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    },
    JWT_SECRET,
    JWT_ALG,
  );
}

/**
 * Vérifie la signature et la date d'expiration d'un jeton.
 * Retourne null si le jeton est absent, invalide ou expiré.
 *
 * ATTENTION : hono/jwt place le jeton complet dans error.message
 * (JwtTokenExpired). On ne journalise donc QUE le nom de la classe d'erreur,
 * sinon un jeton réutilisable se retrouverait dans les logs.
 */
export async function verifyToken(raw: string): Promise<AuthPayload | null> {
  try {
    const payload = await verify(raw, JWT_SECRET, JWT_ALG);

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      console.warn("[auth] Jeton refusé : contenu inattendu");
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      exp: Number(payload.exp),
    };
  } catch (error) {
    console.warn(
      `[auth] Jeton refusé (${(error as Error).constructor.name})`,
    );
    return null;
  }
}
