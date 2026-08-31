import "./unistyles";
import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.dimension.space[3],
    paddingHorizontal: theme.dimension.space[6],
    borderWidth: 1,
    borderRadius: theme.dimension.radius.pill,
  },
  buttonPrimary: {
    borderColor: theme.color.action.primary.background,
    backgroundColor: theme.color.action.primary.background,
  },
  buttonSecondary: {
    borderColor: theme.color.border.default,
    backgroundColor: theme.color.surface.card,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    color: theme.color.action.primary.foreground,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
  },
  buttonSecondaryLabel: {
    color: theme.color.text.primary,
  },
  field: {
    gap: theme.dimension.space[2],
  },
  label: {
    color: theme.color.text.primary,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
  },
  input: {
    minHeight: 44,
    paddingVertical: theme.dimension.space[3],
    paddingHorizontal: theme.dimension.space[4],
    borderWidth: 1,
    borderColor: theme.color.border.default,
    borderRadius: theme.dimension.radius.md,
    backgroundColor: theme.color.surface.card,
    color: theme.color.text.primary,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.md,
  },
  supportingText: {
    color: theme.color.text.secondary,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.sm,
  },
  errorText: {
    color: theme.color.feedback.error.foreground,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.sm,
  },
  controlRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.dimension.space[2],
  },
  controlLabel: {
    flex: 1,
    color: theme.color.text.primary,
    fontFamily: theme.font.family.sans,
    fontSize: theme.font.size.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.color.border.default,
    borderRadius: theme.dimension.radius.sm,
    backgroundColor: theme.color.surface.card,
  },
  checkboxChecked: {
    borderColor: theme.color.action.primary.background,
    backgroundColor: theme.color.action.primary.background,
  },
  checkboxMark: {
    color: theme.color.action.primary.foreground,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
  },
}));
