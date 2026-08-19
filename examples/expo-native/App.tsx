import { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type ViewStyle,
} from "react-native";
import {
  darkTheme,
  lightTheme,
  type Theme,
  type ThemeName,
} from "@assalabs/design-system-example-theme/native";

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: "center",
      padding: theme.dimension.space[6],
      backgroundColor: theme.color.surface.canvas,
    },
    eyebrow: {
      marginBottom: theme.dimension.space[3],
      color: theme.color.text.link,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.sm,
      fontWeight: theme.font.weight.semibold,
      letterSpacing: 1.4,
    },
    title: {
      color: theme.color.text.primary,
      fontFamily: theme.font.family.display,
      fontSize: theme.font.size.xl,
      fontWeight: theme.font.weight.semibold,
      lineHeight: 40,
    },
    body: {
      marginTop: theme.dimension.space[4],
      color: theme.color.text.secondary,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.md,
      lineHeight: 25,
    },
    card: {
      marginTop: theme.dimension.space[8],
      padding: theme.dimension.space[6],
      borderWidth: 1,
      borderColor: theme.color.border.subtle,
      borderRadius: theme.dimension.radius.lg,
      backgroundColor: theme.color.surface.card,
    },
    cardTitle: {
      color: theme.color.text.primary,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.lg,
      fontWeight: theme.font.weight.semibold,
    },
    cardBody: {
      marginTop: theme.dimension.space[2],
      color: theme.color.text.secondary,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.sm,
      lineHeight: 21,
    },
    button: {
      alignItems: "center",
      marginTop: theme.dimension.space[6],
      paddingVertical: theme.dimension.space[3],
      paddingHorizontal: theme.dimension.space[6],
      borderRadius: theme.dimension.radius.pill,
      backgroundColor: theme.color.action.primary.background,
    } satisfies ViewStyle,
    buttonPressed: {
      backgroundColor: theme.color.action.primary.pressed,
    },
    buttonLabel: {
      color: theme.color.action.primary.foreground,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.md,
      fontWeight: theme.font.weight.semibold,
    },
  });
}

export default function App() {
  const systemTheme = useColorScheme();
  const [override, setOverride] = useState<ThemeName>();
  const themeName = override ?? (systemTheme === "dark" ? "dark" : "light");
  const theme = themeName === "dark" ? darkTheme : lightTheme;
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.eyebrow}>NATIVE OUTPUT</Text>
      <Text style={styles.title}>Plain TypeScript themes.</Text>
      <Text style={styles.body}>
        The Expo app consumes generated values without depending on Terrazzo or
        a styling framework at runtime.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Same semantic contract</Text>
        <Text style={styles.cardBody}>
          Surface, text, border, action, feedback, spacing, and motion tokens
          match the web output.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOverride(themeName === "dark" ? "light" : "dark")}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonLabel}>
          Use {themeName === "dark" ? "light" : "dark"} theme
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
