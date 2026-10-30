import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../theme";

export function DeparturePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const [draft, setDraft] = useState(new Date());
  const open = (nextMode: "date" | "time") => {
    setDraft(value ?? new Date());
    setMode(nextMode);
  };
  const picker = mode && (
    <DateTimePicker
      value={draft}
      mode={mode}
      minimumDate={mode === "date" ? new Date() : undefined}
      display={Platform.OS === "ios" ? "spinner" : "default"}
      themeVariant="light"
      textColor={colors.ink}
      locale="ro-RO"
      is24Hour
      onChange={(event, date) => {
        if (Platform.OS === "android") {
          setMode(null);
          if (event.type === "set" && date) onChange(date);
        } else if (date) setDraft(date);
      }}
    />
  );
  return (
    <View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
          onPress={() => onChange(null)}
          style={[styles.chip, value === null && styles.selected]}
        >
          <Text style={styles.text}>Acum</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alege data plecării"
          onPress={() => open("date")}
          style={styles.chip}
        >
          <Text style={styles.text}>
            {value
              ? value.toLocaleDateString("ro-RO", {
                  day: "numeric",
                  month: "short",
                })
              : "Altă zi"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Alege ora plecării"
          onPress={() => open("time")}
          style={styles.chip}
        >
          <Text style={styles.text}>
            {value
              ? value.toLocaleTimeString("ro-RO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Altă oră"}
          </Text>
        </Pressable>
      </View>
      {picker}
      {Platform.OS === "ios" && mode !== null && (
        <View style={styles.row}>
          <Pressable style={styles.chip} onPress={() => setMode(null)} accessibilityRole="button">
            <Text style={styles.text}>Anulează</Text>
          </Pressable>
          <Pressable style={[styles.chip, styles.selected]} onPress={() => { onChange(draft); setMode(null); }} accessibilityRole="button">
            <Text style={styles.text}>Confirmă</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: { backgroundColor: colors.greenLight, borderColor: colors.green },
  text: { color: colors.ink, fontSize: 13 },
});
