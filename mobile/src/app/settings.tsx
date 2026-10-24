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
  const [privacy, setPrivacy] = useState(false);
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
        <View style={styles.divider} />
        <Text style={styles.label}>Server</Text>
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
            GPS doar în prim-plan. Coordonatele nu sunt salvate. La alegerea
            unei destinații, locația este trimisă serverului pentru actualizarea
            traseului; zona vizibilă și ora sunt trimise pentru umbre. Căutarea
            adreselor și harta folosesc furnizorii nativi Google/Apple. Umbrele
            sunt estimări geometrice, nu măsurători de temperatură.
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
});
