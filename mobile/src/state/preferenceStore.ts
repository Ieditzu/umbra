import {
  DEFAULT_PREFERENCES,
  restorePreferences,
  serializePreferences,
} from "../domain/preferences.ts";
import type { AppPreferences } from "../domain/preferences.ts";
export const PREFERENCE_KEY = "umbra.preferences.v1";
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
export type PreferencePatch =
  | Partial<AppPreferences>
  | ((current: AppPreferences) => Partial<AppPreferences>);

/** Merge early interactions after hydration and serialize native writes to prevent stale saves. */
export function createPreferenceStore(storage: Storage, platform: string) {
  let current = { ...DEFAULT_PREFERENCES };
  let early: Partial<AppPreferences> = {};
  let loaded = false;
  let dirty = false;
  let reading: Promise<void> | null = null;
  let writing = Promise.resolve();
  const listeners = new Set<(value: AppPreferences) => void>();
  const emit = () => listeners.forEach((listener) => listener(current));
  const normalize = (value: AppPreferences) =>
    restorePreferences(serializePreferences(value), platform);
  function load(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (reading) return reading;
    reading = storage
      .getItem(PREFERENCE_KEY)
      .then((raw) => {
        current = normalize({ ...restorePreferences(raw, platform), ...early });
        early = {};
        loaded = true;
        emit();
      })
      .finally(() => {
        reading = null;
      });
    return reading;
  }
  function update(change: PreferencePatch): Promise<void> {
    const patch = typeof change === "function" ? change(current) : change;
    const next = normalize({ ...current, ...patch });
    const changed =
      serializePreferences(current) !== serializePreferences(next);
    if (!changed && loaded && !dirty) return Promise.resolve();
    if (!loaded) {
      for (const key of Object.keys(patch) as (keyof AppPreferences)[]) {
        if (key in DEFAULT_PREFERENCES)
          Object.assign(early, { [key]: next[key] });
      }
    }
    current = next;
    dirty = true;
    if (changed) emit();
    const save = writing
      .catch(() => {})
      .then(async () => {
        await load();
        const snapshot = serializePreferences(current);
        await storage.setItem(PREFERENCE_KEY, snapshot);
        if (snapshot === serializePreferences(current)) dirty = false;
      });
    writing = save;
    return save;
  }
  return {
    load,
    update,
    snapshot: () => current,
    subscribe(listener: (value: AppPreferences) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
