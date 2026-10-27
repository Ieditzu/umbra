// Per-phone measuring preferences (docs/shadow-heights.md §6.7, §7.3).
export type MeasureSettings = {
  /** Opt-in: send measurements to the shared heights database. */
  contribute: boolean;
  /** Anonymous random install id, created only when contributing is turned on. */
  contributor: string;
  /** Initials for observer agreement in the field study; never uploaded. */
  observer: string;
  /** Field-study blind mode: hide known heights and ruler numbers while measuring. */
  blind: boolean;
  /** Shared ids whose server copy still has to be deleted (offline delete). */
  pendingDeletes: string[];
  /** Delete every shared measurement of this install id when the server is reachable. */
  pendingDeleteAll: boolean;
};
export const MEASURE_SETTINGS_KEY = "umbra.measureSettings.v1";
export const DEFAULT_MEASURE_SETTINGS: MeasureSettings = {
  contribute: false,
  contributor: "",
  observer: "",
  blind: false,
  pendingDeletes: [],
  pendingDeleteAll: false,
};
export function restoreMeasureSettings(raw: string | null): MeasureSettings {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return { ...DEFAULT_MEASURE_SETTINGS };
    return {
      contribute: v.contribute === true && /^[0-9a-f]{32}$/.test(v.contributor),
      contributor: /^[0-9a-f]{32}$/.test(v.contributor) ? v.contributor : "",
      observer:
        typeof v.observer === "string" ? v.observer.trim().slice(0, 24) : "",
      blind: v.blind === true,
      pendingDeletes: Array.isArray(v.pendingDeletes)
        ? v.pendingDeletes
            .filter(
              (id: unknown) =>
                typeof id === "string" && /^[a-z0-9-]{8,64}$/.test(id),
            )
            .slice(-500)
        : [],
      pendingDeleteAll: v.pendingDeleteAll === true,
    };
  } catch {
    return { ...DEFAULT_MEASURE_SETTINGS };
  }
}
