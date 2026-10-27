import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { LocationFix } from "../domain/live";
import {
  combineMeasurements,
  ENGINE_VERSION,
  evaluateSubmission,
  methodLabel,
  reasonLabel,
  referenceLabel,
} from "../domain/measurements";
import type {
  Checklist,
  Measurement,
  ReferenceMethod,
  Submission,
} from "../domain/measurements";
import {
  adviceLabel,
  compass,
  heightLabel,
  metres,
  windowsLabel,
} from "../domain/measureText";
import { project } from "../engine/geometry";
import type { Point } from "../engine/geometry";
import type { MeasureTarget } from "../engine/measureTarget";
import {
  droneLength,
  expectedSigma,
  measuringWindows,
  shadowAxis,
  snapGpsTip,
  sunAdvice,
} from "../engine/shadowMeasure";
import type { DronePhoto, MeasureMethod } from "../engine/shadowMeasure";
import { useMeasurements } from "../state/MeasurementProvider";
import { colors } from "../theme";

const GPS_SECONDS = 12;
const CHECKS: { key: keyof Checklist; label: string }[] = [
  { key: "sharpShadow", label: "Soare direct, umbră clară" },
  {
    key: "clearGround",
    label: "Vârful e pe sol liber (fără mașini, copaci, garduri)",
  },
  {
    key: "roofCorner",
    label: "Am ales colțul acoperișului, nu camera liftului",
  },
  { key: "flatGround", label: "Teren plat între zid și vârf" },
];
const noChecks: Checklist = {
  clearGround: false,
  sharpShadow: false,
  roofCorner: false,
  flatGround: false,
};
const statusText = {
  accepted: "acceptată",
  rejected: "respinsă",
  needs_review: "de verificat",
};
const uploadText = {
  local: "doar pe telefon",
  pending: "se trimite",
  sent: "trimisă",
  failed: "refuzată de server",
};
const METHOD_TITLES: Record<MeasureMethod, string> = {
  tape_laser: "Ruletă / laser",
  phone_gps: "Telefon (GPS)",
  drone_nadir: "Dronă (foto de sus)",
};
const REFERENCE_SIGMA: Record<ReferenceMethod, number> = {
  laser_indirect: 0.5,
  drone_altitude: 1,
  floor_count: 1.5,
};
const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const number = (text: string) => Number(text.replace(",", "."));
type Axis = ReturnType<typeof shadowAxis>;

export function MeasurePanel({
  target,
  loading,
  error,
  cornerIndex,
  onCorner,
  onTip,
  fix,
  now,
  onClose,
}: {
  target: MeasureTarget | null;
  loading: boolean;
  error: string;
  cornerIndex: number | null;
  onCorner: (index: number) => void;
  onTip: (tip: Point | null) => void;
  fix: LocationFix | null;
  now: number;
  onClose: () => void;
}) {
  const store = useMeasurements();
  const blind = store.settings.blind;
  const [method, setMethod] = useState<MeasureMethod>("tape_laser");
  const corner = target?.corners.find((c) => c.index === cornerIndex) ?? null;
  const cornerPoint = useMemo(
    () => (corner ? project(corner.coordinate) : null),
    [corner],
  );
  const axis = useMemo(
    () => (cornerPoint ? shadowAxis(cornerPoint, now) : null),
    [cornerPoint, now],
  );
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime();
  // Recomputed per corner and day, not on every clock tick.
  const windows = useMemo(
    () => (cornerPoint ? measuringWindows(cornerPoint, dayStart) : []),
    [cornerPoint, dayStart],
  );
  const mine = useMemo(
    () => store.list.filter((m) => m.osm_building === target?.id),
    [store.list, target?.id],
  );
  const refs = useMemo(
    () => store.references.filter((r) => r.osm_building === target?.id),
    [store.references, target?.id],
  );
  const estimate = useMemo(
    () => combineMeasurements(mine, target?.levels ?? null),
    [mine, target?.levels],
  );
  const position = target
    ? target.corners.findIndex((c) => c.index === cornerIndex)
    : -1;
  const step = (delta: number) => {
    if (!target?.corners.length) return;
    const n = target.corners.length;
    onCorner(target.corners[(Math.max(0, position) + delta + n) % n].index);
  };
  const elevation = axis?.sun.elevation ?? target?.sun.elevation ?? 0;
  const advice = sunAdvice(elevation);
  const shared = target?.shared;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>Măsoară clădirea</Text>
          <Text style={styles.subtle}>
            {target
              ? `OSM ${target.id}${blind ? " · mod orb" : ""}`
              : "Atinge o clădire din Constanța pe hartă."}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Închide măsurarea"
          onPress={onClose}
          style={styles.close}
        >
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ gap: 10 }}
        keyboardShouldPersistTaps="handled"
      >
        {loading && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={colors.green} />
            <Text style={styles.subtle}>Se caută clădirea</Text>
          </View>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!store.error && <Text style={styles.error}>{store.error}</Text>}
        {!target && !loading && (
          <View style={{ gap: 6 }}>
            <Text style={styles.subtle}>
              Pe hartă, conturul clădirilor arată sursa înălțimii:
            </Text>
            {[
              ["#2F8F4E", "Măsurată"],
              ["#2F62C9", "Din OpenStreetMap"],
              ["#7FA7E8", "Estimată din etaje"],
              ["#9AA19D", "Necunoscută"],
            ].map(([color, label]) => (
              <View key={label} style={styles.row}>
                <View style={[styles.swatch, { borderColor: color }]} />
                <Text style={styles.subtle}>{label}</Text>
              </View>
            ))}
            <Text style={styles.subtle}>
              {store.settings.contribute
                ? "Partajarea e pornită: măsurătorile noi sunt trimise bazei comune (fără locație sau nume)."
                : "Măsurătorile rămân pe telefon. Poți porni partajarea din Setări."}
            </Text>
          </View>
        )}
        {target && (
          <>
            <Text style={styles.heading}>
              {blind
                ? "Înălțime ascunsă (mod orb pentru studiu)"
                : heightLabel(target.height, target.levels, estimate)}
            </Text>
            {!blind && shared && shared.count > 0 && (
              <Text style={styles.subtle}>
                Baza comună:{" "}
                {shared.height_m === null ? "—" : metres(shared.height_m)}
                {shared.sigma_m === null
                  ? ""
                  : ` ± ${metres(shared.sigma_m)}`}{" "}
                · {shared.count}{" "}
                {shared.count === 1 ? "măsurătoare" : "măsurători"} ·{" "}
                {shared.confirmed ? "confirmată" : "neconfirmată"}
              </Text>
            )}
            {!target.measurable && (
              <Text style={styles.error}>
                {target.reason === "elevated"
                  ? "Clădirile suspendate nu pot fi măsurate din umbră."
                  : "Măsurarea funcționează doar pentru clădirile OSM din Constanța."}
              </Text>
            )}
            {!blind && estimate && !estimate.confirmed && (
              <Text style={styles.subtle}>
                {metres(estimate.height)} ± {metres(estimate.sigma)} din{" "}
                {estimate.count}{" "}
                {estimate.count === 1 ? "măsurătoare" : "măsurători"} ·
                neconfirmată. Mai măsoară o dată, la cel puțin 10 minute
                distanță sau cu alt observator, ori folosește ruleta, laserul
                sau drona.
              </Text>
            )}
            <Text style={styles.subtle}>
              Soare {elevation.toFixed(1).replace(".", ",")}° · umbra spre{" "}
              {compass((axis?.sun.azimuth ?? target.sun.azimuth) + 180)} ·{" "}
              {adviceLabel[advice]}
            </Text>
            {!!windows.length && (
              <Text style={styles.subtle}>{windowsLabel(windows, now)}</Text>
            )}
            {target.measurable && !target.corners.length && (
              <Text style={styles.error}>
                Nu am găsit un colț care să arunce umbră acum.
              </Text>
            )}
            {target.measurable && !!target.corners.length && (
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Colțul anterior"
                  style={styles.stepper}
                  onPress={() => step(-1)}
                >
                  <Ionicons name="chevron-back" size={18} color={colors.ink} />
                </Pressable>
                <Text style={[styles.subtle, { flex: 1 }]}>
                  Colțul {position + 1} din {target.corners.length} ·{" "}
                  {corner?.clear === true
                    ? "umbra ar trebui să cadă pe teren liber"
                    : corner?.clear === false
                      ? "umbra poate atinge altă clădire"
                      : "poziție neverificată"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Colțul următor"
                  style={styles.stepper}
                  onPress={() => step(1)}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.ink}
                  />
                </Pressable>
              </View>
            )}
            {target.measurable && cornerPoint && axis && (
              <MeasureAttempt
                // A new building or corner starts a fresh attempt.
                key={`${target.id}:${cornerIndex}`}
                target={target}
                cornerPoint={cornerPoint}
                axis={axis}
                method={method}
                onMethod={setMethod}
                fix={fix}
                onTip={onTip}
                blind={blind}
                sunTooLow={advice === "too_low"}
              />
            )}
            {!!mine.length && (
              <View style={{ gap: 4 }}>
                <Text style={styles.methodTitle}>Măsurătorile tale</Text>
                {[...mine].reverse().map((m) => {
                  const effective = estimate?.statuses.get(m.id) ?? m;
                  return (
                    <View key={m.id} style={styles.row}>
                      <Text style={[styles.subtle, { flex: 1 }]}>
                        {new Date(m.measured_at).toLocaleString("ro-RO", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ·{" "}
                        {blind
                          ? "înălțime ascunsă"
                          : `${metres(m.height_m)} ± ${metres(m.sigma_m)}`}{" "}
                        · {methodLabel[m.method]}
                        {m.observer ? ` · ${m.observer}` : ""} ·{" "}
                        {statusText[effective.status]}
                        {effective.reason
                          ? ` · ${reasonLabel[effective.reason] ?? effective.reason}`
                          : ""}
                        {m.upload ? ` · ${uploadText[m.upload]}` : ""}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Șterge măsurătoarea"
                        onPress={() => store.remove(m.id)}
                        style={styles.stepper}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color={colors.error}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
            {target.measurable && (
              <ReferenceForm buildingId={target.id} hidden={blind} />
            )}
            {!blind && !!refs.length && (
              <View style={{ gap: 4 }}>
                {refs.map((r) => (
                  <View key={r.id} style={styles.row}>
                    <Text style={[styles.subtle, { flex: 1 }]}>
                      Referință: {metres(r.height_m)} ± {metres(r.sigma_m)} ·{" "}
                      {referenceLabel[r.method]}
                      {r.note ? ` · ${r.note}` : ""}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Șterge referința"
                      onPress={() => store.removeReference(r.id)}
                      style={styles.stepper}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color={colors.error}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.attribution}>
              Contur © OpenStreetMap contributors · ODbL. Înălțimea măsurată
              este o estimare geometrică, nu o măsurătoare oficială.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Independent reference height for the field study (§7.2); not used for routing. */
function ReferenceForm({
  buildingId,
  hidden,
}: {
  buildingId: string;
  hidden: boolean;
}) {
  const store = useMeasurements();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ReferenceMethod>("laser_indirect");
  const [height, setHeight] = useState("");
  const [sigma, setSigma] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  if (!open)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>
          Adaugă înălțime de referință (studiu)
        </Text>
      </Pressable>
    );
  return (
    <View style={styles.result}>
      <Text style={styles.methodTitle}>Înălțime de referință</Text>
      <Text style={styles.subtle}>
        {hidden
          ? "În modul orb, referința o introduce altă persoană decât cea care măsoară umbra."
          : "Măsurată independent, de exemplu cu funcția de înălțime a laserului."}
      </Text>
      <View style={styles.methods}>
        {(Object.keys(referenceLabel) as ReferenceMethod[]).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: method === m }}
            onPress={() => setMethod(m)}
            style={[styles.method, method === m && styles.methodOn]}
          >
            <Text style={styles.subtle}>{referenceLabel[m]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          value={height}
          onChangeText={setHeight}
          keyboardType="decimal-pad"
          placeholder="Înălțime (m)"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <TextInput
          value={sigma}
          onChangeText={setSigma}
          keyboardType="decimal-pad"
          placeholder={`± ${String(REFERENCE_SIGMA[method]).replace(".", ",")} m`}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        maxLength={200}
        placeholder="Notă (instrument, etaje, înălțime etaj…)"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {!!problem && <Text style={styles.error}>{problem}</Text>}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          style={[styles.secondary, { flex: 1 }]}
          onPress={() => setOpen(false)}
        >
          <Text style={styles.secondaryText}>Renunță</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.primary, { flex: 1 }]}
          onPress={() => {
            const h = number(height),
              s = sigma.trim() ? number(sigma) : REFERENCE_SIGMA[method];
            if (!(h >= 0.1 && h <= 1000) || !(s >= 0 && s <= 100)) {
              setProblem("Introdu înălțimea și eroarea în metri.");
              return;
            }
            store.addReference({
              id: newId(),
              osm_building: buildingId,
              method,
              height_m: h,
              sigma_m: s,
              measured_at: new Date().toISOString(),
              note: note.trim(),
              observer: store.settings.observer,
            });
            setOpen(false);
            setHeight("");
            setSigma("");
            setNote("");
            setProblem("");
          }}
        >
          <Text style={styles.primaryText}>Salvează</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One measuring attempt for a building corner: method, checklist, tip and result. */
function MeasureAttempt({
  target,
  cornerPoint,
  axis,
  method,
  onMethod,
  fix,
  onTip,
  blind,
  sunTooLow,
}: {
  target: MeasureTarget;
  cornerPoint: Point;
  axis: Axis;
  method: MeasureMethod;
  onMethod: (method: MeasureMethod) => void;
  fix: LocationFix | null;
  onTip: (tip: Point | null) => void;
  blind: boolean;
  sunTooLow: boolean;
}) {
  const store = useMeasurements();
  const [distance, setDistance] = useState("");
  const [drone, setDrone] = useState({
    altitude_m: "",
    focal_mm: "",
    sensor_mm: "",
    image_px: "",
    shadow_px: "",
    time: "",
  });
  const [checks, setChecks] = useState<Checklist>(noChecks);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [draft, setDraft] = useState<Measurement | null>(null);
  const [problem, setProblem] = useState("");
  const samples = useRef<{ point: Point; accuracy: number; at: number }[]>([]);
  const elevation = axis.sun.elevation;

  /** Build the raw submission and evaluate it with the same rules the server uses. */
  function finish(
    parts: Pick<
      Submission,
      "length_m" | "lateral_m" | "gps_accuracy_m" | "drone"
    >,
    at = Date.now(),
  ) {
    if (!parts.drone && !(parts.length_m > 0.3)) {
      setProblem("Vârful trebuie să fie pe linia umbrei, departe de colț.");
      return;
    }
    const submission: Submission = {
      id: newId(),
      osm_building: target.id,
      method,
      corner: cornerPoint,
      ...parts,
      measured_at: new Date(at).toISOString(),
      checklist: checks,
      app_version: Constants.expoConfig?.version ?? "0.1.0",
      engine_version: ENGINE_VERSION,
    };
    let measurement: Measurement;
    try {
      measurement = {
        ...evaluateSubmission(submission, target.levels),
        observer: store.settings.observer,
      };
    } catch (e) {
      setProblem((e as Error).message);
      return;
    }
    setProblem("");
    onTip(measurement.tip);
    setDraft(measurement);
  }
  // Latest-render completion handler for the GPS timer callback.
  const complete = useRef<() => void>(() => {});
  useEffect(() => {
    complete.current = () => {
      setRemaining(null);
      try {
        const gps = snapGpsTip(cornerPoint, axis, samples.current);
        finish({
          length_m: Math.round(gps.length * 100) / 100,
          lateral_m: Math.round(gps.lateral * 100) / 100,
          gps_accuracy_m: Math.round(gps.accuracy * 10) / 10,
          drone: null,
        });
      } catch (e) {
        setProblem((e as Error).message);
      }
    };
  });
  // Collect fixes while the person stands at the shadow tip.
  const sampling = remaining !== null;
  useEffect(() => {
    if (!sampling || !fix) return;
    if (samples.current.some((s) => s.at === fix.timestamp)) return;
    samples.current.push({
      point: project(fix),
      accuracy: fix.accuracy,
      at: fix.timestamp,
    });
  }, [fix, sampling]);
  useEffect(() => {
    if (!sampling) return;
    const tick = setInterval(
      () => setRemaining((r) => (r === null ? null : Math.max(0, r - 1))),
      1000,
    );
    const done = setTimeout(() => complete.current(), GPS_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [sampling]);

  const allChecked = CHECKS.every(
    (c) => checks[c.key] || c.key === "flatGround",
  );
  if (draft)
    return (
      <View style={styles.result}>
        <Text style={styles.resultHeight}>
          {blind
            ? "Măsurătoare înregistrată"
            : `${metres(draft.height_m)} ± ${metres(draft.sigma_m)}`}
        </Text>
        <Text style={styles.subtle}>
          {blind ? "" : `Umbră ${metres(draft.length_m)} · `}soare{" "}
          {draft.sun_elevation_deg.toFixed(1).replace(".", ",")}° ·{" "}
          {methodLabel[draft.method]} · {statusText[draft.status]}
          {draft.reason
            ? ` · ${reasonLabel[draft.reason] ?? draft.reason}`
            : ""}
        </Text>
        <Text style={styles.subtle}>
          Salvează și încercările respinse: studiul are nevoie de toate.
        </Text>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            style={[styles.secondary, { flex: 1 }]}
            onPress={() => {
              setDraft(null);
              onTip(null);
            }}
          >
            <Text style={styles.secondaryText}>Renunță</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.primary, { flex: 1 }]}
            onPress={() => {
              store.add(draft);
              setDraft(null);
              setChecks(noChecks);
              setDistance("");
              onTip(null);
            }}
          >
            <Text style={styles.primaryText}>Salvează</Text>
          </Pressable>
        </View>
      </View>
    );
  return (
    <>
      <Text style={styles.subtle}>
        {blind
          ? "Linia portocalie pornește din colțul ales în direcția umbrei."
          : "Linia portocalie pornește din colțul ales în direcția umbrei. Cifrele arată unde ar cădea vârful pentru acea înălțime."}
      </Text>
      <View style={styles.methods}>
        {(["tape_laser", "phone_gps", "drone_nadir"] as MeasureMethod[]).map(
          (m) => {
            const sigma = expectedSigma(target.expected_height_m, elevation, m);
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: method === m }}
                disabled={sampling}
                onPress={() => onMethod(m)}
                style={[styles.method, method === m && styles.methodOn]}
              >
                <Text style={styles.methodTitle}>{METHOD_TITLES[m]}</Text>
                <Text style={styles.subtle}>
                  {sigma === null || blind ? "—" : `≈ ±${metres(sigma)}`}
                </Text>
              </Pressable>
            );
          },
        )}
      </View>
      {CHECKS.map((c) => (
        <Pressable
          key={c.key}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: checks[c.key] }}
          onPress={() => setChecks((v) => ({ ...v, [c.key]: !v[c.key] }))}
          style={styles.row}
        >
          <Ionicons
            name={checks[c.key] ? "checkbox" : "square-outline"}
            size={22}
            color={checks[c.key] ? colors.green : colors.muted}
          />
          <Text style={[styles.body, { flex: 1 }]}>{c.label}</Text>
        </Pressable>
      ))}
      {sunTooLow && method !== "drone_nadir" ? (
        <Text style={styles.error}>
          Soarele e prea jos acum. Poți introduce o fotografie de dronă făcută
          mai devreme.
        </Text>
      ) : method === "tape_laser" ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.subtle}>
            Măsoară de la baza colțului până la mijlocul marginii încețoșate a
            umbrei, de-a lungul liniei.
          </Text>
          <View style={styles.row}>
            <TextInput
              value={distance}
              onChangeText={setDistance}
              keyboardType="decimal-pad"
              placeholder="Distanța (m)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Distanța de la colț la vârful umbrei, în metri"
            />
            <Pressable
              accessibilityRole="button"
              disabled={!allChecked}
              style={[styles.primary, !allChecked && styles.disabled]}
              onPress={() => {
                const length = number(distance);
                if (!Number.isFinite(length) || length <= 0 || length > 1000) {
                  setProblem("Introdu o distanță în metri, de exemplu 23,5.");
                  return;
                }
                finish({
                  length_m: length,
                  lateral_m: null,
                  gps_accuracy_m: null,
                  drone: null,
                });
              }}
            >
              <Text style={styles.primaryText}>Calculează</Text>
            </Pressable>
          </View>
        </View>
      ) : method === "phone_gps" ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.subtle}>
            Stai nemișcat pe vârful umbrei colțului, pe linia portocalie.
            Telefonul face media pozițiilor GPS {GPS_SECONDS} secunde.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!allChecked || sampling || !fix}
            style={[
              styles.primary,
              (!allChecked || sampling || !fix) && styles.disabled,
            ]}
            onPress={() => {
              samples.current = [];
              setProblem("");
              setRemaining(GPS_SECONDS);
            }}
          >
            <Text style={styles.primaryText}>
              {sampling
                ? `Se măsoară… ${remaining} s`
                : !fix
                  ? "Se așteaptă GPS-ul"
                  : "Sunt la vârful umbrei"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={styles.subtle}>
            Fotografie drept în jos, cu clădirea aproape de centru. Măsoară în
            pixeli umbra de la colț la vârf. Respectă regulile AACR și zonele
            interzise.
          </Text>
          {(
            [
              ["altitude_m", "Altitudine deasupra solului (m)"],
              ["focal_mm", "Distanță focală reală (mm)"],
              ["sensor_mm", "Lățime senzor (mm)"],
              ["image_px", "Lățime imagine (px)"],
              ["shadow_px", "Lungimea umbrei (px)"],
              ["time", "Ora fotografiei (HH:MM, azi)"],
            ] as const
          ).map(([key, label]) => (
            <TextInput
              key={key}
              value={drone[key]}
              onChangeText={(v) => setDrone((d) => ({ ...d, [key]: v }))}
              keyboardType={
                key === "time" ? "numbers-and-punctuation" : "decimal-pad"
              }
              placeholder={label}
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel={label}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={!allChecked}
            style={[styles.primary, !allChecked && styles.disabled]}
            onPress={() => {
              const photo: DronePhoto = {
                altitude_m: number(drone.altitude_m),
                focal_mm: number(drone.focal_mm),
                sensor_mm: number(drone.sensor_mm),
                image_px: number(drone.image_px),
                shadow_px: number(drone.shadow_px),
              };
              let length;
              try {
                length = droneLength(photo).length;
              } catch (e) {
                setProblem((e as Error).message);
                return;
              }
              const match = /^(\d{1,2})[:.](\d{2})$/.exec(drone.time.trim());
              const taken = new Date();
              if (match)
                taken.setHours(Number(match[1]), Number(match[2]), 0, 0);
              if (
                drone.time.trim() &&
                (!match || taken.getTime() > Date.now())
              ) {
                setProblem(
                  "Ora fotografiei trebuie să fie azi, în trecut (HH:MM).",
                );
                return;
              }
              finish(
                {
                  length_m: Math.round(length * 100) / 100,
                  lateral_m: null,
                  gps_accuracy_m: null,
                  drone: photo,
                },
                taken.getTime(),
              );
            }}
          >
            <Text style={styles.primaryText}>Calculează</Text>
          </Pressable>
        </View>
      )}
      {!allChecked && (
        <Text style={styles.subtle}>
          Bifează primele trei condiții înainte de măsurare.
        </Text>
      )}
      {!!problem && <Text style={styles.error}>{problem}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    gap: 10,
    boxShadow: "0 4px 18px #00000026",
    elevation: 6,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  heading: { fontSize: 15, fontWeight: "700", color: colors.ink },
  body: { fontSize: 14, color: colors.ink },
  subtle: { fontSize: 13, lineHeight: 18, color: colors.muted },
  error: { fontSize: 13, lineHeight: 18, color: colors.error },
  attribution: { fontSize: 11, color: colors.muted },
  scroll: { maxHeight: 360 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.greenLight,
  },
  stepper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.greenLight,
  },
  swatch: { width: 22, height: 14, borderRadius: 3, borderWidth: 2 },
  methods: { flexDirection: "row", gap: 8 },
  method: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    gap: 2,
  },
  methodOn: { borderColor: colors.green, backgroundColor: colors.greenLight },
  methodTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  primary: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
  },
  primaryText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  secondary: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.greenLight,
  },
  secondaryText: { color: colors.green, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.45 },
  result: {
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.greenLight,
  },
  resultHeight: { fontSize: 24, fontWeight: "800", color: colors.green },
});
