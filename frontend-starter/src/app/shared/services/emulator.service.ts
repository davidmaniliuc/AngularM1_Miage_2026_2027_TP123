import { Injectable } from '@angular/core';
import { Ps1Core, compile } from '@davidmaniliuc/substation';

/**
 * URL of the emulator core. The Angular builder does not rewrite
 * `new URL('./ps1.wasm', import.meta.url)` inside a dependency, so
 * angular.json copies the file from node_modules into the build output.
 */
export const PS1_WASM_URL = '/ps1/ps1.wasm';

/** Creates PS1 machines from @davidmaniliuc/substation. */
@Injectable({ providedIn: 'root' })
export class EmulatorService {
  /** The ~7 MB module is downloaded and compiled once, then shared by every machine. */
  private module?: Promise<WebAssembly.Module>;

  /** A new machine. Each game page gets its own and drops it when it leaves. */
  create(): Promise<Ps1Core> {
    this.module ??= compile(PS1_WASM_URL).catch((error: unknown) => {
      // A failed download is retried on the next call instead of staying cached.
      this.module = undefined;
      throw error;
    });
    return this.module.then((module) => Ps1Core.create(module));
  }
}
