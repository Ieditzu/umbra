import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Coordinate } from "../domain/routes";
import { calculateSolarPower } from "../services/calculations";
import { colors } from "../theme";

const dateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function SolarPanel({ point, loading, error, onClose }: { point: Coordinate | null; loading: boolean; error: string; onClose: () => void }) {
  const [today] = useState(() => new Date());
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState(day);
  const [picker, setPicker] = useState(false);
  const [watts, setWatts] = useState("400");
  const [tilt, setTilt] = useState("30");
  const [direction, setDirection] = useState("0");
  const [result, setResult] = useState<{ energy_kwh: number; irradiation_kwh_m2: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState<{ point: Coordinate; date: string; watts: number; tilt: number; azimuth: number } | null>(null);
  const selectedDate = dateString(day);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    void calculateSolarPower(request.point, request.date, request.watts, request.tilt, request.azimuth, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setResult(value); setMessage(""); }
    }).catch((reason) => {
      if (!controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : "Estimarea nu este disponibilă.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [request]);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setRequest(null); setBusy(false); setResult(null); setMessage(""); };
  const pickerView = <DateTimePicker value={draft} mode="date" minimumDate={today} maximumDate={new Date(today.getTime() + 14 * 86400000)} display={Platform.OS === "ios" ? "spinner" : "default"} themeVariant="light" textColor={colors.ink} onChange={(event, value) => {
    if (Platform.OS === "android") { setPicker(false); if (event.type === "set" && value) { setDay(value); setRequest(null); setBusy(false); setResult(null); } }
    else if (value) setDraft(value);
  }} />;
  return <View style={styles.panel}>
    <View style={styles.row}><Text style={styles.title}>Panou solar</Text><Pressable accessibilityRole="button" accessibilityLabel="Închide panoul solar" onPress={onClose}><Text style={styles.close}>Închide</Text></Pressable></View>
    <Text style={styles.note}>{loading ? "Se verifică clădirea…" : point ? "Acoperiș selectat · apasă altă clădire pentru a-l schimba" : "Apasă pe o clădire de pe hartă."}</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Alege ziua" onPress={() => { setDraft(day); setPicker(true); }} style={styles.date}><Text style={styles.label}>{day.toLocaleDateString("ro-RO")}</Text></Pressable>
    <View style={styles.row}>
      <View style={styles.field}><Text style={styles.caption}>Putere W</Text><TextInput accessibilityLabel="Puterea panoului în wați" keyboardType="numeric" value={watts} onChangeText={(v) => change(setWatts, v)} style={styles.input} /></View>
      <View style={styles.field}><Text style={styles.caption}>Înclinare °</Text><TextInput accessibilityLabel="Înclinarea panoului în grade" keyboardType="numeric" value={tilt} onChangeText={(v) => change(setTilt, v)} style={styles.input} /></View>
      <View style={styles.field}><Text style={styles.caption}>Direcție °</Text><TextInput accessibilityLabel="Direcția panoului în grade față de sud" keyboardType="numbers-and-punctuation" value={direction} onChangeText={(v) => change(setDirection, v)} style={styles.input} /></View>
    </View>
    <Text style={styles.note}>Direcție: 0° sud, −90° est, 90° vest.</Text>
    <Pressable accessibilityRole="button" disabled={!point || busy || loading} onPress={() => {
      const capacity = Number(watts), angle = Number(tilt), bearing = Number(direction);
      setResult(null);
      if (!point || !watts.trim() || !tilt.trim() || !direction.trim() || !Number.isFinite(capacity) || capacity < 50 || capacity > 10000 || !Number.isFinite(angle) || angle < 0 || angle > 90 || !Number.isFinite(bearing) || bearing < -180 || bearing > 180) { setMessage("Verifică puterea și unghiurile panoului."); return; }
      setMessage(""); setBusy(true); setRequest({ point, date: selectedDate, watts: capacity, tilt: angle, azimuth: bearing });
    }} style={[styles.button, (!point || busy || loading) && { opacity: 0.45 }]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Calculează</Text>}</Pressable>
    {result && <Text style={styles.result}>≈ {result.energy_kwh.toFixed(2)} kWh în ziua aleasă</Text>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    <Text style={styles.note}>Prognoză Open-Meteo · pierderi estimate 14% · umbra acoperișului și a obstacolelor nu este inclusă.</Text>
    {picker && (Platform.OS === "android" ? pickerView : <Modal transparent animationType="slide" onRequestClose={() => setPicker(false)}><View style={styles.backdrop}><View style={styles.sheet}>{pickerView}<View style={styles.row}><Pressable onPress={() => setPicker(false)}><Text style={styles.close}>Anulează</Text></Pressable><Pressable onPress={() => { setDay(draft); setRequest(null); setBusy(false); setResult(null); setPicker(false); }}><Text style={styles.close}>Confirmă</Text></Pressable></View></View></View></Modal>)}
  </View>;
}
const styles = StyleSheet.create({
  panel: { backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 8 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, title: { fontSize: 19, fontWeight: "700", color: colors.ink }, close: { color: colors.green, fontWeight: "600", padding: 8 }, note: { color: colors.muted, fontSize: 12, lineHeight: 17 }, error: { color: colors.error, fontSize: 13 }, field: { flex: 1 }, caption: { color: colors.muted, fontSize: 11 }, input: { color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 6, minHeight: 38 }, label: { color: colors.ink, fontSize: 13 }, date: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 10 }, button: { backgroundColor: colors.green, borderRadius: 12, minHeight: 42, justifyContent: "center", alignItems: "center" }, buttonText: { color: colors.white, fontWeight: "700" }, result: { color: colors.green, fontSize: 18, fontWeight: "700" }, backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0006" }, sheet: { backgroundColor: colors.white, padding: 24, paddingBottom: 40 },
});
