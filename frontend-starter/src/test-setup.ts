// Node 22+ defines a global `localStorage` accessor that throws/returns undefined
// without a `--localstorage-file` flag. It shadows the jsdom/happy-dom
// `localStorage` that vitest would otherwise expose, so `AuthService` (which reads
// `localStorage` at construction time) breaks under the unit-test builder. Replace
// it with a minimal in-memory `Storage` implementation for the test run.
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});
