import { describe, it, expect } from 'vitest';
import { cueFiles, pickDisc } from './disc-files';

const file = (name: string, content = 'x') => new File([content], name);
const ONE_FILE = 'FILE "Croc.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n';
const TWO_FILES = 'FILE "Track 1.bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "Track 2.bin" BINARY\n  TRACK 02 AUDIO\n';

describe('cueFiles', () => {
  it('reads quoted and bare FILE names', () => {
    expect(cueFiles(TWO_FILES)).toEqual(['Track 1.bin', 'Track 2.bin']);
    expect(cueFiles('file game.bin BINARY\n')).toEqual(['game.bin']);
  });
});

describe('pickDisc', () => {
  it('prefers a .chd', async () => {
    const chd = file('Croc.chd');
    expect(await pickDisc([file('Croc.bin'), chd])).toEqual({ ok: true, disc: { file: chd } });
  });

  it('sends a .bin with the text of its .cue', async () => {
    const bin = file('Croc.bin');
    expect(await pickDisc([file('Croc.cue', ONE_FILE), bin, file('Other.bin')])).toEqual({
      ok: true,
      disc: { file: bin, cue: ONE_FILE },
    });
  });

  it('sends a lone .bin', async () => {
    const bin = file('Croc.BIN');
    expect(await pickDisc([bin])).toEqual({ ok: true, disc: { file: bin } });
  });

  it('refuses a .cue with several FILEs and points to .chd', async () => {
    const result = await pickDisc([file('Game.cue', TWO_FILES), file('Track 1.bin'), file('Track 2.bin')]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain('.chd');
  });

  it('asks for the .bin a .cue names', async () => {
    const result = await pickDisc([file('Croc.cue', ONE_FILE)]);
    expect(!result.ok && result.message).toContain('Croc.bin');
  });

  it('refuses several .bin without a .cue, and unknown files', async () => {
    expect((await pickDisc([file('a.bin'), file('b.bin')])).ok).toBe(false);
    expect((await pickDisc([file('game.iso')])).ok).toBe(false);
  });
});
