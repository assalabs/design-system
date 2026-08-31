import { themes } from "{{PACKAGE_SCOPE}}/theme/native";
import { StyleSheet } from "react-native-unistyles";

const breakpoints = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

type AppThemes = typeof themes;
type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes,
  breakpoints,
  settings: {
    adaptiveThemes: true,
  },
});
