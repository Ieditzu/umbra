import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomBytes } from "expo-crypto";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";
import {
  MAX_MEASUREMENTS,
  MEASUREMENT_KEY,
  measuredHeights,
  REFERENCE_KEY,
  restoreMeasurements,
  restoreReferences,
} from "../domain/measurements";
import type {
  Measurement,
  Reference,
  UploadState,
} from "../domain/measurements";
import {
  DEFAULT_MEASURE_SETTINGS,
  MEASURE_SETTINGS_KEY,
  restoreMeasureSettings,
} from "../domain/measureSettings";
import type { MeasureSettings } from "../domain/measureSettings";
import { setMeasuredHeights } from "../services/calculations";
import {
  deleteShared,
  SharedError,
  uploadMeasurement,
} from "../services/heights";

export type SyncState = "off" | "idle" | "syncing" | "offline" | "error";
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Measurements live on the phone. With sharing turned on they are also uploaded to the
 * shared heights database; otherwise only confirmed height ranges reach the PC server.
 */
function useMeasurementState() {
  const [list, setList] = useState<Measurement[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);
  const [settings, setSettings] = useState<MeasureSettings>(
    DEFAULT_MEASURE_SETTINGS,
  );
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  const [sync, setSync] = useState<SyncState>("off");
  const [syncMessage, setSyncMessage] = useState("");
  const writing = useRef(Promise.resolve());
  const latest = useRef({ list, references, settings });
  const syncing = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all(
      [MEASUREMENT_KEY, REFERENCE_KEY, MEASURE_SETTINGS_KEY].map((key) =>
        AsyncStorage.getItem(key),
      ),
    )
      .then(([m, r, s]) => {
        if (!active) return;
        // Keep anything recorded before storage finished loading.
        const next = {
          list: [...restoreMeasurements(m), ...latest.current.list],
          references: [...restoreReferences(r), ...latest.current.references],
          settings: restoreMeasureSettings(s),
        };
        latest.current = next;
        setList(next.list);
        setReferences(next.references);
        setSettings(next.settings);
      })
      .catch(() => {
        if (active) setError("Măsurătorile salvate nu au putut fi citite.");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);
  /** Apply a change and save it; writes are serialized so an older snapshot never wins. */
  const commit = useCallback((change: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...change };
    if (change.list) setList(change.list);
    if (change.references) setReferences(change.references);
    if (change.settings) setSettings(change.settings);
    const snapshot = latest.current;
    writing.current = writing.current
      .catch(() => {})
      .then(() =>
        AsyncStorage.multiSet([
          [MEASUREMENT_KEY, JSON.stringify(snapshot.list)],
          [REFERENCE_KEY, JSON.stringify(snapshot.references)],
          [MEASURE_SETTINGS_KEY, JSON.stringify(snapshot.settings)],
        ]),
      )
      .then(
        () => setError(""),
        () => setError("Măsurătorile nu au putut fi salvate pe telefon."),
      );
  }, []);
  const patchMeasurement = useCallback(
    (id: string, patch: Partial<Measurement>) =>
      commit({
        list: latest.current.list.map((m) =>
          m.id === id ? { ...m, ...patch } : m,
        ),
      }),
    [commit],
  );

  const runSync = useCallback(async () => {
    if (syncing.current || !hydrated) return;
    const { settings: s } = latest.current;
    const work =
      (s.pendingDeleteAll && s.contributor) ||
      (s.pendingDeletes.length && s.contributor) ||
      (s.contribute && latest.current.list.some((m) => m.upload === "pending"));
    if (!work) {
      setSync(s.contribute ? "idle" : "off");
      return;
    }
    syncing.current = true;
    setSync("syncing");
    try {
      if (s.pendingDeleteAll) {
        await deleteShared(null, s.contributor);
        commit({
          settings: {
            ...latest.current.settings,
            pendingDeleteAll: false,
            pendingDeletes: [],
          },
        });
      }
      for (const id of latest.current.settings.pendingDeletes) {
        await deleteShared(id, latest.current.settings.contributor);
        commit({
          settings: {
            ...latest.current.settings,
            pendingDeletes: latest.current.settings.pendingDeletes.filter(
              (d) => d !== id,
            ),
          },
        });
      }
      if (latest.current.settings.contribute)
        for (const m of latest.current.list.filter(
          (x) => x.upload === "pending",
        )) {
          try {
            const status = await uploadMeasurement(
              m,
              latest.current.settings.contributor,
            );
            patchMeasurement(m.id, { upload: "sent", server_status: status });
          } catch (e) {
            if (!(e instanceof SharedError) || !e.permanent) throw e;
            // Refused by the server (unknown building, not a corner, …): keep it local.
            patchMeasurement(m.id, { upload: "failed" });
            setSyncMessage(e.message);
          }
        }
      setSync(latest.current.settings.contribute ? "idle" : "off");
    } catch (e) {
      setSync(e instanceof SharedError && e.status === 0 ? "offline" : "error");
      setSyncMessage(e instanceof Error ? e.message : "Sincronizarea a eșuat.");
    } finally {
      syncing.current = false;
    }
  }, [hydrated, commit, patchMeasurement]);
  // Retry after changes, every minute, and when the app returns to the foreground.
  useEffect(() => {
    const soon = setTimeout(() => void runSync(), 1500);
    return () => clearTimeout(soon);
  }, [list, settings, runSync]);
  useEffect(() => {
    const timer = setInterval(() => void runSync(), 60000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void runSync();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [runSync]);

  const add = useCallback(
    (m: Measurement) =>
      commit({
        list: [
          ...latest.current.list,
          {
            ...m,
            upload: (latest.current.settings.contribute
              ? "pending"
              : "local") as UploadState,
          },
        ].slice(-MAX_MEASUREMENTS),
      }),
    [commit],
  );
  const remove = useCallback(
    (id: string) => {
      const m = latest.current.list.find((x) => x.id === id);
      const s = latest.current.settings;
      commit({
        list: latest.current.list.filter((x) => x.id !== id),
        // A measurement that reached the server is deleted there too.
        ...(m?.upload === "sent" && s.contributor
          ? { settings: { ...s, pendingDeletes: [...s.pendingDeletes, id] } }
          : {}),
      });
    },
    [commit],
  );
  const addReference = useCallback(
    (r: Reference) =>
      commit({ references: [...latest.current.references, r].slice(-500) }),
    [commit],
  );
  const removeReference = useCallback(
    (id: string) =>
      commit({
        references: latest.current.references.filter((r) => r.id !== id),
      }),
    [commit],
  );
  const updateSettings = useCallback(
    (patch: Partial<MeasureSettings>) =>
      commit({ settings: { ...latest.current.settings, ...patch } }),
    [commit],
  );
  /** Opt in or out of sharing. Turning it on never uploads older measurements by itself. */
  const setContribute = useCallback(
    (on: boolean) => {
      const s = latest.current.settings;
      commit({
        settings: {
          ...s,
          contribute: on,
          contributor: s.contributor || (on ? hex(getRandomBytes(16)) : ""),
        },
        // Turning sharing off stops uploads that have not happened yet.
        ...(!on
          ? {
              list: latest.current.list.map((m) =>
                m.upload === "pending" ? { ...m, upload: "local" as const } : m,
              ),
            }
          : {}),
      });
    },
    [commit],
  );
  const shareExisting = useCallback(
    () =>
      commit({
        list: latest.current.list.map((m) =>
          m.upload === "local" || m.upload === "failed" || !m.upload
            ? { ...m, upload: "pending" as const }
            : m,
        ),
      }),
    [commit],
  );
  /** Remove everything this install shared; local copies stay unless deleted separately. */
  const deleteAllShared = useCallback(() => {
    const s = latest.current.settings;
    if (!s.contributor) return;
    commit({
      settings: {
        ...s,
        contribute: false,
        pendingDeleteAll: true,
        pendingDeletes: [],
      },
      list: latest.current.list.map((m) =>
        m.upload === "sent" || m.upload === "pending"
          ? { ...m, upload: "local" as const, server_status: undefined }
          : m,
      ),
    });
  }, [commit]);
  const clearLocal = useCallback(
    () => commit({ list: [], references: [] }),
    [commit],
  );

  const heights = useMemo(() => measuredHeights(list), [list]);
  const heightsKey = useMemo(
    () => heights.map((h) => `${h.id}:${h.low_m}:${h.high_m}`).join("|"),
    [heights],
  );
  // Set during render so requests started by this render include the new heights.
  setMeasuredHeights(heights);
  return {
    list,
    references,
    settings,
    hydrated,
    error,
    sync,
    syncMessage,
    add,
    remove,
    addReference,
    removeReference,
    updateSettings,
    setContribute,
    shareExisting,
    deleteAllShared,
    clearLocal,
    syncNow: runSync,
    heights,
    heightsKey,
  };
}
type MeasurementState = ReturnType<typeof useMeasurementState>;
const Context = createContext<MeasurementState | null>(null);
export function MeasurementProvider({ children }: PropsWithChildren) {
  const value = useMeasurementState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMeasurements() {
  const value = useContext(Context);
  if (!value) throw new Error("MeasurementProvider missing");
  return value;
}
