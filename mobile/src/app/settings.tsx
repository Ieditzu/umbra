import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { normalizeApiUrl } from "../domain/settings";
import { usePlanner } from "../state/PlannerProvider";
import { colors } from "../theme";

export default function SettingsScreen() {
  const planner = usePlanner();
  const [url, setUrl] = useState(planner.settings.apiUrl);
  const [extra, setExtra] = useState(planner.settings.maxExtraMinutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await planner.saveSettings({
        apiUrl: normalizeApiUrl(url),
        maxExtraMinutes: extra,
      });
      router.back();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Preferințele nu au putut fi salvate.",
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
        <View style={styles.intro}>
          <Ionicons name="walk-outline" size={28} color={colors.green} />
          <Text style={styles.title}>Un traseu pe ritmul tău.</Text>
          <Text style={styles.body}>
            Alege cât timp în plus accepți pentru o alternativă mai umbrită.
            Limita se compară cu traseul cel mai rapid.
          </Text>
        </View>
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
        <Text style={styles.body}>
          Duratele folosesc momentan o viteză de mers de 1,4 m/s. Nu includ
          opriri, semafoare sau aglomerație.
        </Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Serviciul de calcul</Text>
        <Text style={styles.body}>
          Harta și alegerea punctelor funcționează independent. Optimizarea
          traseelor și umbrele necesită un serviciu separat cu date OSM și
          geometria clădirilor. Acesta nu este încă implementat în acest
          repository.
        </Text>
        <TextInput
          accessibilityLabel="Adresa serviciului de trasee"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://api.exemplu.ro"
          placeholderTextColor={colors.muted}
          value={url}
          onChangeText={setUrl}
          style={styles.input}
          maxLength={500}
        />
        <Text style={styles.small}>
          Fără adresă, aplicația nu generează trasee sau procente de umbră
          fictive. HTTP este permis doar pentru dezvoltare în rețeaua locală. Pe
          telefon, localhost înseamnă telefonul, nu calculatorul.
        </Text>
        <View style={styles.divider} />
        <Text style={styles.label}>Datele tale</Text>
        <Text style={styles.body}>
          Localizarea se cere doar când apeși butonul dedicat sau folosești
          căutarea nativă Android. Nu urmărim locația în fundal. Adresele
          căutate sunt trimise geocodorului telefonului. Punctele și ora
          plecării sunt trimise serverului configurat doar când apeși „Compară
          traseele”.
        </Text>
        <Text style={styles.body}>
          Se salvează local numai adresa serverului și limita de ocol.
          Coordonatele și traseele nu sunt salvate de aplicație. Harta este
          furnizată de Google Maps pe Android și Apple Maps pe iOS; nu
          reprezintă calculul umbrelor din OSM.
        </Text>
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
            <Text style={styles.saveText}>Salvează preferințele</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, paddingBottom: 40 },
  intro: { gap: 12, marginBottom: 22 },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.8,
  },
  body: {
    fontSize: 14,
    lineHeight: 23,
    color: colors.muted,
    marginVertical: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: 12,
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
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 24 },
  input: {
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  small: { color: colors.muted, fontSize: 12, lineHeight: 20, marginTop: 10 },
  error: { color: colors.error, marginVertical: 14, lineHeight: 22 },
  save: {
    minHeight: 54,
    backgroundColor: colors.green,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  saveText: { color: colors.white, fontWeight: "600", fontSize: 15 },
});
