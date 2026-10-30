import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { studyCsv, studyExport } from "../domain/measurements";
import { useMeasurements } from "../state/MeasurementProvider";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlanner } from "../state/PlannerProvider";
import { colors } from "../theme";

export default function SettingsScreen() {
  const planner = usePlanner();
  const [draftExtra, setExtra] = useState<number | null>(null);
  const extra = draftExtra ?? planner.settings.maxExtraMinutes;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const measurements = useMeasurements();
  const m = measurements.settings;
  const shared = measurements.list.filter((x) => x.upload === "sent").length;
  const pending = measurements.list.filter(
    (x) => x.upload === "pending",
  ).length;
  const local = measurements.list.filter(
    (x) => !x.upload || x.upload === "local" || x.upload === "failed",
  ).length;
  const syncLabel = {
    off: "Partajare oprită",
    idle: "Sincronizat",
    syncing: "Se sincronizează…",
    offline: "Serverul nu răspunde; se reîncearcă automat",
    error: measurements.syncMessage || "Sincronizarea a eșuat",
  }[measurements.sync];
  async function exportStudy(format: "json" | "csv") {
    const message =
      format === "json"
        ? JSON.stringify(
            studyExport(
              measurements.list,
              measurements.references,
              new Date().toISOString(),
            ),
          )
        : studyCsv(measurements.list);
    try {
      await Share.share({ message, title: `umbra-masuratori.${format}` });
    } catch {
      setError("Exportul nu a putut fi deschis.");
    }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await planner.saveSettings({
        maxExtraMinutes: extra,
      });
      router.back();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Nu s-au salvat setările.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Ocol maxim</Text>
        <View style={styles.choices}>
          {[0, 5, 10, 15].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: extra === value }}
              onPress={() => setExtra(value)}
              style={[styles.chip, extra === value && styles.selected]}
            >
              <Text style={styles.chipText}>+{value} min</Text>
            </Pressable>
          ))}
        </View>
        {!!error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy || !planner.hydrated}
          onPress={() => void save()}
          style={[styles.save, busy && { opacity: 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.saveText}>Salvează</Text>
          )}
        </Pressable>
        <View style={styles.divider} />
        <Text style={styles.label}>Măsurători din umbră</Text>
        <Text style={styles.small}>
          {measurements.list.length} măsurători ·{" "}
          {measurements.references.length} referințe · {shared} trimise ·{" "}
          {pending} în așteptare · {local} doar pe telefon
        </Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.option}>Contribuie la baza comună</Text>
            <Text style={styles.small}>
              Se trimit datele măsurătorii și un cod anonim, fără nume,
              fotografii sau istoricul locațiilor. Înălțimile devin publice
              (ODbL). Sub 16 ani, cere acordul unui părinte sau coordonator.
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Contribuie la baza comună"
            accessibilityState={{ checked: m.contribute }}
            onPress={() => measurements.setContribute(!m.contribute)}
            style={[styles.toggle, m.contribute && styles.toggleOn]}
          >
            <View
              style={[
                styles.toggleDot,
                m.contribute && { alignSelf: "flex-end" },
              ]}
            />
          </Pressable>
        </View>
        {(m.contribute || m.pendingDeleteAll || !!m.pendingDeletes.length) && (
          <Text style={styles.small}>{syncLabel}</Text>
        )}
        {m.contribute && local > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={measurements.shareExisting}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              Trimite și cele {local} salvate doar pe telefon
            </Text>
          </Pressable>
        )}
        {!!m.contributor && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(
                "Ștergi datele trimise?",
                "Toate măsurătorile trimise de pe acest telefon vor fi șterse de pe server, iar partajarea se oprește. Copiile de pe telefon rămân.",
                [
                  { text: "Renunță", style: "cancel" },
                  {
                    text: "Șterge",
                    style: "destructive",
                    onPress: measurements.deleteAllShared,
                  },
                ],
              )
            }
            style={styles.secondary}
          >
            <Text style={[styles.secondaryText, { color: colors.error }]}>
              Șterge de pe server tot ce am trimis
            </Text>
          </Pressable>
        )}
        <Text style={[styles.option, { marginTop: 18 }]}>
          Inițiale observator (studiu)
        </Text>
        <TextInput
          value={m.observer}
          onChangeText={(observer) =>
            measurements.updateSettings({ observer: observer.slice(0, 24) })
          }
          placeholder="ex. AP"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          style={[styles.input, { marginTop: 8 }]}
        />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.option}>Mod orb</Text>
            <Text style={styles.small}>
              Ascunde înălțimile și referințele în timpul măsurării.
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Mod orb"
            accessibilityState={{ checked: m.blind }}
            onPress={() => measurements.updateSettings({ blind: !m.blind })}
            style={[styles.toggle, m.blind && styles.toggleOn]}
          >
            <View
              style={[styles.toggleDot, m.blind && { alignSelf: "flex-end" }]}
            />
          </Pressable>
        </View>
        <View style={[styles.choices, { marginTop: 14 }]}>
          <Pressable
            accessibilityRole="button"
            disabled={
              !measurements.list.length && !measurements.references.length
            }
            onPress={() => void exportStudy("json")}
            style={styles.chip}
          >
            <Text style={styles.chipText}>Exportă JSON (studiu)</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!measurements.list.length}
            onPress={() => void exportStudy("csv")}
            style={styles.chip}
          >
            <Text style={styles.chipText}>Exportă CSV</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: privacy }}
          onPress={() => setPrivacy((value) => !value)}
          style={styles.privacyButton}
        >
          <Text style={styles.small}>Confidențialitate și date</Text>
        </Pressable>
        {privacy && (
          <Text style={styles.small}>
            GPS doar în prim-plan. Coordonatele și destinația sunt trimise
            serverului de pe PC pentru calcul; nu sunt salvate. Umbrele și
            clădirile sunt calculate pe server din datele OpenStreetMap ale
            zonei vizualizate. Căutarea adreselor și harta folosesc Google/Apple
            sau OpenFreeMap pentru harta OSM de pe iOS. Umbrele sunt estimări
            geometrice, nu măsurători de temperatură. Măsurătorile din umbră
            rămân pe telefon; serverul de pe PC primește doar înălțimile
            confirmate. Dacă pornești contribuția, măsurătorile (fără locația
            ta) ajung în baza comună și le poți șterge oricând.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, paddingBottom: 40 },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 16,
  },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    minHeight: 46,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
  },
  selected: { borderColor: colors.green, backgroundColor: colors.greenLight },
  chipText: { color: colors.ink, fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 30 },
  input: {
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  small: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  error: { color: colors.error, marginVertical: 14, lineHeight: 22 },
  save: {
    minHeight: 54,
    backgroundColor: colors.green,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },
  saveText: { color: colors.white, fontWeight: "600", fontSize: 15 },
  privacyButton: { marginTop: 22, minHeight: 44, justifyContent: "center" },
  option: { fontSize: 15, fontWeight: "600", color: colors.ink },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 3,
    backgroundColor: colors.line,
  },
  toggleOn: { backgroundColor: colors.green },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  secondary: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.greenLight,
  },
  secondaryText: { color: colors.green, fontWeight: "700", fontSize: 14 },
});
