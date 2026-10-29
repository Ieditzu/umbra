import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Coordinate } from "../domain/routes";
import { searchPlaces } from "../services/placeSearch";
import type { SearchPlace } from "../services/placeSearch";
import type { Place, Selection } from "../state/PlannerProvider";
import { colors } from "../theme";

export function PlaceSearch({ target, near, onClose, onChoose }: {
  target: Selection | null;
  near: Coordinate | null;
  onClose: () => void;
  onChoose: (place: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [position] = useState(near);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchPlaces(text, position, controller.signal).then((places) => {
        if (!controller.signal.aborted) {
          setResults(places);
          setStatus("done");
        }
      }).catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    }, 800);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, position]);

  function changeQuery(value: string) {
    setQuery(value);
    setResults([]);
    setStatus(value.trim().length >= 3 ? "loading" : "idle");
  }

  return (
    <Modal visible={target !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.page}>
        <View style={styles.searchBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Înapoi" onPress={onClose} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
          <TextInput autoFocus value={query} onChangeText={changeQuery} style={styles.input}
            placeholder={target === "origin" ? "De unde pleci?" : "Unde mergi?"}
            placeholderTextColor={colors.muted} accessibilityLabel="Caută un loc sau o adresă"
            returnKeyType="search" maxLength={200} autoCorrect={false} />
          {status === "loading" ? <ActivityIndicator color={colors.green} /> : query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Șterge căutarea" onPress={() => changeQuery("")} style={styles.iconButton}>
              <Ionicons name="close-circle" size={21} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {status === "error" && <Text accessibilityRole="alert" style={styles.message}>Căutarea nu este disponibilă. Verifică conexiunea și încearcă din nou.</Text>}
          {status === "done" && results.length === 0 && <Text style={styles.message}>Nu am găsit locuri. Încearcă alt nume sau adaugă orașul.</Text>}
          {results.map((place, index) => (
            <Pressable accessibilityRole="button" key={`${place.coordinate.latitude}-${place.coordinate.longitude}-${index}`}
              onPress={() => onChoose({ coordinate: place.coordinate, label: place.label })} style={styles.result}>
              <View style={styles.pin}><Ionicons name="location-outline" size={21} color={colors.ink} /></View>
              <View style={styles.resultText}>
                <Text style={styles.resultTitle}>{place.label}</Text>
                {!!place.detail && <Text style={styles.detail}>{place.detail}</Text>}
              </View>
              <Ionicons name="arrow-up-outline" size={20} color={colors.muted} style={{ transform: [{ rotate: "45deg" }] }} />
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.mapChoice}>
            <View style={styles.pin}><Ionicons name="map-outline" size={21} color={colors.ink} /></View>
            <Text style={styles.resultTitle}>Alege pe hartă</Text>
          </Pressable>
          <Text style={styles.attribution}>Căutare: Photon · © OpenStreetMap contributors</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 12, paddingRight: 12, minHeight: 56, borderRadius: 28, backgroundColor: "#f1f3f2" },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, color: colors.ink, fontSize: 17, paddingVertical: 12 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, paddingHorizontal: 24, paddingVertical: 20 },
  result: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, gap: 14 },
  pin: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#eef0ee", alignItems: "center", justifyContent: "center" },
  resultText: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingBottom: 10 },
  resultTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  detail: { color: colors.muted, fontSize: 13, marginTop: 4 },
  mapChoice: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, gap: 14 },
  attribution: { color: colors.muted, fontSize: 11, marginHorizontal: 24, marginTop: 16 },
});
