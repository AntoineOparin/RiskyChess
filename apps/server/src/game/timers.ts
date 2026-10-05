/** Keyed setTimeout registry so transitions can cancel whatever timer they supersede. */
export class Timers {
  private readonly handles = new Map<string, ReturnType<typeof setTimeout>>();

  set(key: string, ms: number, fn: () => void): void {
    this.clear(key);
    this.handles.set(
      key,
      setTimeout(() => {
        this.handles.delete(key);
        fn();
      }, ms),
    );
  }

  clear(key: string): void {
    const h = this.handles.get(key);
    if (h !== undefined) clearTimeout(h);
    this.handles.delete(key);
  }

  clearPrefix(prefix: string): void {
    for (const key of [...this.handles.keys()]) if (key.startsWith(prefix)) this.clear(key);
  }

  clearAll(): void {
    for (const key of [...this.handles.keys()]) this.clear(key);
  }
}
