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

/** Champs d'une piste qu'une réponse HTTP peut exposer (jamais storedName ni coverStoredName). */
export interface PublicTrack {
  id: string;
  ownerId: string;
  title: string;
  originalName: string;
  /** Type du fichier stocké : audio/flac pour un ALAC converti. */
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  /** "alac" si le fichier envoyé a été converti en FLAC. */
  transcodedFrom?: string;
  /** Une pochette est disponible sur GET /tracks/:id/cover. */
  hasCover: boolean;
  /** "private" : visible par le propriétaire seul ; "public" : par tous. */
  visibility: "private" | "public";
  /** Nom du propriétaire, ajouté par GET /tracks (pas par POST ni PATCH). */
  ownerName?: string;
  createdAt: Date;
}

/** Champs d'un jeu qu'une réponse HTTP peut exposer (jamais coverStoredName). */
export interface PublicGame {
  id: string;
  ownerId: string;
  title: string;
  /** Numéro de série, ex. SCUS-94163. */
  serial?: string;
  genre?: string;
  /** "ntsc-u", "ntsc-j" ou "pal". */
  region?: string;
  year?: number;
  favorite: boolean;
  /** Une pochette est disponible sur GET /games/:id/cover. */
  hasCover: boolean;
  /** L'image disque, téléchargeable sur GET /games/:id/disc. */
  disc?: PublicDisc;
  createdAt: Date;
}

/** Image disque d'un jeu (jamais discStoredName). */
export interface PublicDisc {
  /** Nom du fichier envoyé. */
  name: string;
  size: number;
  format: "chd" | "bin";
  /** Le .cue envoyé avec un .bin, à repasser à loadDisc. */
  cue?: string;
}

/** Champs d'un BIOS qu'une réponse HTTP peut exposer (jamais storedName). */
export interface PublicBios {
  id: string;
  ownerId: string;
  originalName: string;
  size: number;
  /** Faux : image absente de la table du cœur, utilisable mais non identifiée. */
  known: boolean;
  /** "america", "europe" ou "japan", si le BIOS est reconnu. */
  region?: string;
  /** Version du BIOS, ex. "2.2". */
  version?: string;
  /** Modèles de console concernés, ex. "SCPH-1001, 5003…". */
  description?: string;
  /** Le BIOS utilisé par défaut pour lancer un jeu. */
  isDefault: boolean;
  createdAt: Date;
}

/**
 * Enveloppe de pagination attendue par le frontend Angular.
 * Les cinq premiers champs existaient déjà ; les suivants sont calculés par
 * mongoose-aggregate-paginate-v2 et documentés dans API_CONTRACT.md.
 */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  /** Numéro (à partir de 1) du premier élément de la page dans la liste complète. */
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
}
