import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Ps1Core, compile } from '@davidmaniliuc/substation';
import { EmulatorService, PS1_WASM_URL } from './emulator.service';

// The real module downloads ~7 MB of wasm: only its two entry points are replaced.
vi.mock('@davidmaniliuc/substation', () => ({
  compile: vi.fn(),
  Ps1Core: { create: vi.fn() },
}));

describe('EmulatorService', () => {
  const module = {} as WebAssembly.Module;

  beforeEach(() => {
    vi.mocked(compile).mockReset().mockResolvedValue(module);
    vi.mocked(Ps1Core.create).mockReset().mockResolvedValue({} as Ps1Core);
  });

  it('compiles the wasm copied by angular.json once and creates a machine per call', async () => {
    const service = TestBed.inject(EmulatorService);

    await service.create();
    await service.create();

    expect(compile).toHaveBeenCalledOnce();
    expect(compile).toHaveBeenCalledWith(PS1_WASM_URL);
    expect(Ps1Core.create).toHaveBeenCalledTimes(2);
    expect(Ps1Core.create).toHaveBeenCalledWith(module);
  });

  it('retries the download after a failure', async () => {
    vi.mocked(compile).mockRejectedValueOnce(new Error('offline'));
    const service = TestBed.inject(EmulatorService);

    await expect(service.create()).rejects.toThrow('offline');
    await service.create();
    expect(compile).toHaveBeenCalledTimes(2);
  });
});
