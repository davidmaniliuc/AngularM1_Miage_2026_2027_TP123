/**
 * Computes `bars` normalised levels (0..1) from an audio Blob with the Web Audio API.
 *
 * The Blob is already in memory for playback, so this costs no extra request.
 * The decoded PCM buffer is only kept for the duration of this function.
 * Resolves to [] when the browser (or the test environment) cannot decode.
 */
export async function computePeaks(blob: Blob, bars: number): Promise<number[]> {
  const Ctx = globalThis.OfflineAudioContext;
  if (!Ctx || typeof blob.arrayBuffer !== 'function') return [];

  try {
    // The sample rate only affects decoding precision: 8 kHz is enough for a waveform.
    const context = new Ctx(1, 1, 8000);
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / bars));
    const peaks: number[] = [];

    for (let bar = 0; bar < bars; bar++) {
      // RMS rather than the raw peak: loud, mastered music peaks near 1.0
      // almost everywhere, which would draw a flat block.
      let sum = 0;
      const start = bar * step;
      const end = Math.min(data.length, start + step);
      for (let i = start; i < end; i++) sum += data[i] * data[i];
      peaks.push(Math.sqrt(sum / Math.max(1, end - start)));
    }

    const highest = Math.max(...peaks, 0.001);
    // A slight curve spreads the quiet and loud passages further apart.
    return peaks.map((peak) => Math.pow(peak / highest, 1.6));
  } catch (error) {
    console.warn('[waveform] Décodage impossible, forme d’onde neutre affichée', error);
    return [];
  }
}
