/** Contenu utile d'un jeton JWT accepté par l'API. */
export interface AuthPayload {
  /** `sub` (subject) contient l'identifiant MongoDB de l'utilisateur. */
  sub: string;
  email: string;
  /** Date d'expiration, en secondes depuis 1970. */
  exp: number;
}

/**
 * Typage du contexte Hono. `Variables` décrit ce qu'un middleware peut
 * déposer avec c.set(...) et qu'un handler relit avec c.get(...).
 * C'est l'équivalent typé du `req.auth = ...` d'Express.
 */
export type AppEnv = {
  Variables: {
    auth: AuthPayload;
  };
};

/** Champs d'un utilisateur qu'une réponse HTTP peut exposer. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/** Champs d'une piste qu'une réponse HTTP peut exposer (jamais storedName). */
export interface PublicTrack {
  id: string;
  ownerId: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** Enveloppe de pagination attendue par le frontend Angular. */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
