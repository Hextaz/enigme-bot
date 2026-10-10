import { Image, loadImage } from 'canvas';
export async function loadRemoteImage(url: string): Promise<Image> {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
  return loadImage(Buffer.from(await response.arrayBuffer()));
}
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(private readonly limit = 200, private readonly ttlMs = 300_000, private readonly now = Date.now) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
}
