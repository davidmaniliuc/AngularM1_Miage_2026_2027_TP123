export interface TranscodeOptions {
  /** Exécutable à lancer ; modifiable pour les tests. */
  ffmpeg?: string;
  timeoutMs?: number;
}

/**
 * Convertit un ALAC (.m4a) en FLAC. Les deux formats sont sans perte, mais
 * Chrome et Firefox ne savent décoder que le FLAC.
 *
 * ffmpeg voit la pochette comme un flux vidéo d'une image :
 * - `-map 0:v?` la garde si elle existe (le `?` évite l'échec sinon) ;
 * - `-c:v copy` la recopie sans la réencoder ;
 * - `-disposition:v attached_pic` l'écrit dans un bloc PICTURE du FLAC.
 *
 * Les arguments sont passés en tableau : aucun shell n'intervient, donc un
 * nom de fichier ne peut pas injecter de commande.
 */
export async function alacToFlac(
  src: string,
  dst: string,
  { ffmpeg = "ffmpeg", timeoutMs = 60_000 }: TranscodeOptions = {},
): Promise<void> {
  let proc;
  try {
    proc = Bun.spawn(
      [
        ffmpeg, "-nostdin", "-v", "error", "-y",
        "-i", src,
        "-map", "0:a", "-map", "0:v?",
        "-c:a", "flac", "-c:v", "copy",
        "-disposition:v", "attached_pic",
        dst,
      ],
      { stdout: "ignore", stderr: "pipe", timeout: timeoutMs },
    );
  } catch (error) {
    // Bun lève ENOENT tout de suite si l'exécutable est introuvable.
    console.error("[transcode] ffmpeg introuvable", error);
    throw new Error("ffmpeg n'est pas installé", { cause: error });
  }

  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);

  if (proc.signalCode) {
    throw new Error(`ffmpeg interrompu (${proc.signalCode}) après ${timeoutMs} ms`);
  }

  if (exitCode !== 0) {
    throw new Error(`ffmpeg a échoué (code ${exitCode}) : ${stderr.trim()}`);
  }
}
