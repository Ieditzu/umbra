// Shared entries expire by inactivity, not when one client disconnects.
export class IdleCache extends Map {
  constructor(ttl = 300000, now = Date.now, onDelete = () => {}) {
    super();
    this.ttl = ttl;
    this.now = now;
    this.onDelete = onDelete;
    this.used = new Map();
  }
  get(key) {
    if (!this.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    this.used.set(key, this.now());
    return value;
  }
  set(key, value) {
    if (this.has(key)) this.delete(key);
    this.used.set(key, this.now());
    return super.set(key, value);
  }
  delete(key) {
    if (!this.has(key)) return false;
    const value = super.get(key);
    this.used.delete(key);
    const removed = super.delete(key);
    this.onDelete(value);
    return removed;
  }
  clear() {
    for (const key of this.keys()) this.delete(key);
  }
  sweep() {
    const cutoff = this.now() - this.ttl;
    for (const [key, lastUsed] of this.used)
      if (lastUsed <= cutoff) this.delete(key);
  }
}
