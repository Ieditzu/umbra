import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isCoordinate } from "../domain/routes";
import type { Place, Selection } from "../state/PlannerProvider";
import { colors } from "../theme";

export function PlaceSearch({
  target,
  onClose,
  onChoose,
}: {
  target: Selection | null;
  onClose: () => void;
  onChoose: (place: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef({ value: 0 });
  useEffect(() => {
    const state = operation.current;
    return () => {
      state.value++;
    };
  }, []);
  async function search() {
    if (busy || query.trim().length < 3) return;
    const ticket = ++operation.current.value;
    setBusy(true);
    setError("");
    setResults([]);
    Keyboard.dismiss();
    try {
      if (Platform.OS === "android") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted")
          throw new Error(
            "Căutarea nativă Android necesită permisiunea de localizare. Poți alege punctul direct pe hartă fără această permisiune.",
          );
      }
      if (ticket !== operation.current.value) return;
      const addresses = await Location.geocodeAsync(
        `${query.trim()}, Constanța, România`,
      );
      if (ticket !== operation.current.value) return;
      const places = addresses
        .filter(isCoordinate)
        .slice(0, 5)
        .map((item) => ({
          coordinate: { latitude: item.latitude, longitude: item.longitude },
          label: query.trim(),
        }));
      setResults(places);
      if (!places.length)
        setError(
          "Nu am găsit adresa. Încearcă un nume mai complet sau alege pe hartă.",
        );
    } catch (reason) {
      if (ticket === operation.current.value)
        setError(
          reason instanceof Error
            ? reason.message
            : "Căutarea nu este disponibilă.",
        );
    } finally {
      if (ticket === operation.current.value) setBusy(false);
    }
  }
  return (
    <Modal
      visible={target !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {target === "origin" ? "De unde pleci?" : "Unde mergi?"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>Închide</Text>
          </Pressable>
        </View>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          placeholder="Unde mergi?"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Adresa căutată"
          returnKeyType="search"
          onSubmitEditing={() => void search()}
          maxLength={200}
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy || query.trim().length < 3}
          onPress={() => void search()}
          style={[
            styles.button,
            (busy || query.trim().length < 3) && { opacity: 0.5 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Caută adresa</Text>
          )}
        </Pressable>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <ScrollView keyboardShouldPersistTaps="handled">
          {results.map((place, index) => (
            <Pressable
              accessibilityRole="button"
              key={`${place.coordinate.latitude}-${place.coordinate.longitude}-${index}`}
              onPress={() => onChoose(place)}
              style={styles.result}
            >
              <Text style={styles.resultTitle}>
                {place.label}
                {results.length > 1 ? ` · ${index + 1}` : ""}
              </Text>
              <Text style={styles.note}>
                {place.coordinate.latitude.toFixed(5)},{" "}
                {place.coordinate.longitude.toFixed(5)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>Aleg punctul pe hartă</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper, padding: 22 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, color: colors.ink, fontWeight: "700" },
  close: {
    minHeight: 48,
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: { color: colors.green, fontWeight: "600" },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginVertical: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    borderRadius: 12,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
    marginVertical: 10,
  },
  button: {
    minHeight: 52,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  buttonText: { color: colors.white, fontWeight: "600", fontSize: 15 },
  error: { color: colors.error, lineHeight: 21, paddingVertical: 14 },
  result: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 14,
  },
  resultTitle: { color: colors.ink, fontSize: 16, fontWeight: "500" },
});
