import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import type { Coordinate } from "../domain/routes";
import { solarSavings } from "../domain/solarSavings";
import { solarRoof } from "../domain/solarRoof";
import { calculateSolarPower, getElectricityPrice } from "../services/calculations";
import { colors } from "../theme";

const dateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function SolarPanel({ point, roofId, footprint, loading, error, onClose }: { point: Coordinate | null; roofId: string | null; footprint: Coordinate[]; loading: boolean; error: string; onClose: () => void }) {
  const { height: screenHeight } = useWindowDimensions();
  const [today] = useState(() => new Date());
  const [day, setDay] = useState(today);
  const [draft, setDraft] = useState(day);
  const [picker, setPicker] = useState(false);
  const [roof] = useState(() => solarRoof(footprint));
  const [watts, setWatts] = useState(() => roof.watts ? String(roof.watts) : "");
  const [tilt, setTilt] = useState("30");
  const [direction, setDirection] = useState("0");
  const [price, setPrice] = useState("1,4584");
  const [priceNote, setPriceNote] = useState("Eurostat · sem. I 2026");
  const priceEdited = useRef(false);
  const pricePeriod = useRef("2026-S1");
  const [result, setResult] = useState<{ energy_kwh: number; min_energy_kwh: number; unshaded_kwh: number; uncertain_hours: number; blocked_hours: number; mode: "historical"; reference_dates: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState<{ point: Coordinate; roofId: string; date: string; watts: number; tilt: number; azimuth: number } | null>(null);
  const selectedDate = dateString(day);
  const savings = result ? solarSavings(result.energy_kwh, price) : null;
  const minSavings = result ? solarSavings(result.min_energy_kwh, price) : null;
  useEffect(() => {
    const controller = new AbortController();
    const apply = ({ price: average, period }: { price: number; period: string }) => {
      if (!controller.signal.aborted && !priceEdited.current && Number.isFinite(average) && average > 0 && average <= 100 && /^\d{4}-S[12]$/.test(period) && period >= pricePeriod.current) {
        pricePeriod.current = period;
        setPrice(String(average).replace(".", ","));
        setPriceNote(`Eurostat · sem. ${period.endsWith("S1") ? "I" : "II"} ${period.slice(0, 4)}`);
      }
    };
    void (async () => {
      try { const saved = await AsyncStorage.getItem("umbra.electricityPrice"); if (saved) apply(JSON.parse(saved)); } catch { /* Keep the included Eurostat value. */ }
      try {
        const latest = await getElectricityPrice(controller.signal);
        apply(latest);
        if (latest.period >= pricePeriod.current) await AsyncStorage.setItem("umbra.electricityPrice", JSON.stringify(latest));
      } catch { /* Keep the last known Eurostat value. */ }
    })();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    void calculateSolarPower(request.point, request.roofId, request.date, request.watts, request.tilt, request.azimuth, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setResult(value); setMessage(""); }
    }).catch((reason) => {
      if (!controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : "Estimarea nu este disponibilă.");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [request]);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setRequest(null); setBusy(false); setResult(null); setMessage(""); };
  const pickerView = <DateTimePicker value={draft} mode="date" minimumDate={new Date(2000, 0, 1)} maximumDate={new Date(2100, 11, 31)} display={Platform.OS === "ios" ? "spinner" : "default"} themeVariant="light" textColor={colors.ink} onChange={(event, value) => {
    if (Platform.OS === "android") { setPicker(false); if (event.type === "set" && value) { setDay(value); setRequest(null); setBusy(false); setResult(null); } }
    else if (value) setDraft(value);
  }} />;
  return <ScrollView style={{ maxHeight: screenHeight * 0.6 }} contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
    <View style={styles.row}><Text style={styles.title}>Panou solar</Text><Pressable accessibilityRole="button" accessibilityLabel="Închide panoul solar" onPress={onClose}><Text style={styles.close}>Închide</Text></Pressable></View>
    <Text style={styles.note}>{loading ? "Se verifică clădirea…" : point ? "Acoperiș selectat" : "Alege o clădire pe hartă"}</Text>
    {!!point && <Text style={styles.note}>≈ {Math.round(roof.area)} m² contur · maximum teoretic {roof.panels} panouri (2 m², 400 W/panou)</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Alege ziua" onPress={() => { setDraft(day); setPicker(true); }} style={styles.date}><Text style={styles.label}>{day.toLocaleDateString("ro-RO")}</Text></Pressable>
    <Text style={styles.note}>Media lunară PVGIS</Text>
    <View style={styles.row}>
      <View style={styles.field}><Text style={styles.caption}>Putere totală W</Text><TextInput accessibilityLabel="Puterea totală a panourilor în wați" keyboardType="numeric" value={watts} onChangeText={(v) => change(setWatts, v)} style={styles.input} /></View>
      <View style={styles.field}><Text style={styles.caption}>Înclinare °</Text><TextInput accessibilityLabel="Înclinarea panoului în grade" keyboardType="numeric" value={tilt} onChangeText={(v) => change(setTilt, v)} style={styles.input} /></View>
      <View style={styles.field}><Text style={styles.caption}>Direcție °</Text><TextInput accessibilityLabel="Direcția panoului în grade față de sud" keyboardType="numbers-and-punctuation" value={direction} onChangeText={(v) => change(setDirection, v)} style={styles.input} /></View>
    </View>
    <Text style={styles.note}>Direcție: 0° sud, −90° est, 90° vest.</Text>
    <View style={styles.row}><Text style={[styles.note, { flex: 1 }]}>Preț energie (lei/kWh){priceNote ? ` · ${priceNote}` : ""}</Text><TextInput accessibilityLabel="Prețul energiei în lei pe kilowatt-oră" keyboardType="decimal-pad" value={price} onChangeText={(value) => { priceEdited.current = true; setPrice(value); setPriceNote(""); }} style={[styles.input, styles.price]} /></View>
    <Pressable accessibilityRole="button" disabled={!point || busy || loading} onPress={() => {
      const capacity = Number(watts), angle = Number(tilt), bearing = Number(direction);
      setResult(null);
      if (!point || !roofId || !watts.trim() || !tilt.trim() || !direction.trim() || !Number.isFinite(capacity) || capacity < 50 || capacity > 1000000 || !Number.isFinite(angle) || angle < 0 || angle > 90 || !Number.isFinite(bearing) || bearing < -180 || bearing > 180) { setMessage("Verifică puterea și unghiurile panoului."); return; }
      setMessage(""); setBusy(true); setRequest({ point, roofId, date: selectedDate, watts: capacity, tilt: angle, azimuth: bearing });
    }} style={[styles.button, (!point || busy || loading) && { opacity: 0.45 }]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Calculează</Text>}</Pressable>
    {result && <View>
      <Text style={styles.result}>≈ {result.min_energy_kwh < result.energy_kwh ? `${result.min_energy_kwh.toFixed(2)}–` : ""}{result.energy_kwh.toFixed(2)} kWh / zi</Text>
      {savings !== null
        ? <Text style={styles.result}>≈ {minSavings !== null && minSavings < savings ? `${minSavings.toFixed(2)}–` : ""}{savings.toFixed(2)} lei valoarea energiei / zi</Text>
        : <Text style={styles.error}>Introdu un preț între 0 și 100 lei/kWh.</Text>}
      <Text style={styles.note}>PVGIS {result.reference_dates.join("–")} · Umbră calculată într-un punct · Nu include copacii{result.uncertain_hours > 0 ? " · Umbre parțial incerte" : ""}</Text>
    </View>}
    {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
    {picker && (Platform.OS === "android" ? pickerView : <Modal transparent animationType="slide" onRequestClose={() => setPicker(false)}><View style={styles.backdrop}><View style={styles.sheet}>{pickerView}<View style={styles.row}><Pressable onPress={() => setPicker(false)}><Text style={styles.close}>Anulează</Text></Pressable><Pressable onPress={() => { setDay(draft); setRequest(null); setBusy(false); setResult(null); setPicker(false); }}><Text style={styles.close}>Confirmă</Text></Pressable></View></View></View></Modal>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  panel: { backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 8 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, title: { fontSize: 19, fontWeight: "700", color: colors.ink }, close: { color: colors.green, fontWeight: "600", padding: 8 }, note: { color: colors.muted, fontSize: 12, lineHeight: 17 }, error: { color: colors.error, fontSize: 13 }, field: { flex: 1 }, caption: { color: colors.muted, fontSize: 11 }, input: { color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 6, minHeight: 38 }, label: { color: colors.ink, fontSize: 13 }, price: { width: 76 }, date: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 10 }, button: { backgroundColor: colors.green, borderRadius: 12, minHeight: 42, justifyContent: "center", alignItems: "center" }, buttonText: { color: colors.white, fontWeight: "700" }, result: { color: colors.green, fontSize: 18, fontWeight: "700" }, backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0006" }, sheet: { backgroundColor: colors.white, padding: 24, paddingBottom: 40 },
});
