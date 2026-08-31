import { SafeAreaView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// `theme` is typed by the `declare module` augmentation that ships inside
// `{{scope}}/theme/unistyles`, which index.ts pulls into the program.
const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing(3),
    backgroundColor: theme.color.bg.canvas,
  },
  title: {
    color: theme.color.fg.default,
    fontSize: 28,
    fontWeight: "600",
  },
  body: {
    marginTop: theme.spacing(1),
    color: theme.color.fg.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    marginTop: theme.spacing(3),
    padding: theme.spacing(2),
    borderWidth: 1,
    borderColor: theme.color.border.default,
    borderRadius: theme.dimension.radius.md,
    backgroundColor: theme.color.bg.surface,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2),
    borderRadius: theme.dimension.radius.md,
    backgroundColor: theme.color.brand.default,
  },
  badgeLabel: {
    color: theme.color.fg.onBrand,
    fontWeight: "600",
  },
}));

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Tokens, one source.</Text>
      <Text style={styles.body}>
        Every colour on this screen comes from the generated Unistyles theme.
        Switch the system appearance to see the dark palette.
      </Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Edit tokens in packages/theme, run pnpm build:theme, and this screen
          follows.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Brand</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
