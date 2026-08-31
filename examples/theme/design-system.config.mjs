import { defineDesignSystem } from "@assalabs/design-system-tools";

export default defineDesignSystem({
  name: "Example",
  prefix: "ds",
  source: "./tokens/theme.resolver.json",
  themes: ["light", "dark"],
  defaultTheme: "light",
  outputs: {
    css: "styles/generated.css",
    native: "src/generated/themes.ts",
    tokenNames: "src/generated/tokenNames.ts",
  },
  requiredTokens: [
    "color.surface.canvas",
    "color.surface.card",
    "color.text.primary",
    "color.text.secondary",
    "color.border.default",
    "color.action.primary.background",
    "color.action.primary.foreground",
    "color.focus.ring",
    "dimension.space.4",
    "dimension.radius.md",
    "font.family.sans",
    "motion.duration.normal",
  ],
  contrastPairs: [
    {
      foreground: "color.text.primary",
      background: "color.surface.canvas",
      minimum: 4.5,
      description: "primary text",
    },
    {
      foreground: "color.text.secondary",
      background: "color.surface.canvas",
      minimum: 4.5,
      description: "secondary text",
    },
    {
      foreground: "color.action.primary.foreground",
      background: "color.action.primary.background",
      minimum: 3,
      description: "primary control",
    },
    {
      foreground: "color.focus.ring",
      background: "color.surface.canvas",
      minimum: 3,
      description: "focus indicator",
    },
  ],
});
