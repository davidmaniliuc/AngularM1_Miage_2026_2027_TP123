import path from "node:path";
import { parseFile, selectCover } from "music-metadata";

/** Formats audio acceptés, déterminés par le contenu du fichier. */
export type AudioKind = "mp3" | "wav" | "ogg" | "aac" | "alac" | "flac";

export interface AudioMetadata {
  /** null : le contenu n'est pas un format accepté. */
  kind: AudioKind | null;
  title?: string;
  artist?: string;
  album?: string;
  picture?: { format: string; data: Uint8Array };
}

/**
 * Traduit le couple (conteneur, codec) renvoyé par music-metadata.
 * Un .m4a peut contenir de l'AAC ou de l'ALAC : c'est le codec qui décide.
 */
export function kindOf(
  container: string | undefined,
  codec: string | undefined,
): AudioKind | null {
  if (!container || !codec) return null;
  if (codec === "ALAC") return "alac";
  if (container === "FLAC" && codec === "FLAC") return "flac";
  // Le conteneur MP4 commence par sa marque (M4A, isom, mp42…), qui varie
  // selon l'outil. Seul le parseur MP4 annonce le codec "MPEG-4/AAC" :
  // un AAC brut (ADTS) ou en Matroska renvoie juste "AAC" et reste refusé.
  if (codec.startsWith("MPEG-4/AAC")) return "aac";
  if (container === "MPEG" && codec.endsWith("Layer 3")) return "mp3";
  if (container === "WAVE") return "wav";
  if (container === "Ogg") return "ogg";
  return null;
}

/** Une chaîne vide ou faite d'espaces ne vaut pas un tag. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Lit les tags et la pochette sans décoder l'audio : music-metadata ne
 * parcourt que les zones de métadonnées (ID3, atomes MP4, blocs FLAC…).
 * Le type MIME annoncé par le navigateur n'intervient pas.
 */
export async function readMetadata(filePath: string): Promise<AudioMetadata> {
  let parsed;
  try {
    parsed = await parseFile(filePath);
  } catch (error) {
    console.warn(`[metadata] Fichier illisible : ${path.basename(filePath)}`, error);
    return { kind: null };
  }

  const { format, common } = parsed;
  // selectCover préfère « Cover (front) », sinon prend la première image.
  const cover = selectCover(common.picture);

  return {
    kind: kindOf(format.container, format.codec),
    title: clean(common.title),
    artist: clean(common.artist),
    album: clean(common.album),
    picture: cover ? { format: cover.format, data: cover.data } : undefined,
  };
}
