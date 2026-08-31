import type { TokenNormalized } from "@terrazzo/parser";
import type { ContrastPair, DesignSystemConfig } from "./types.js";

type DtcgColor = {
  colorSpace: string;
  components: Array<number | "none">;
  alpha?: number;
};

function channelLuminance(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: DtcgColor, tokenId: string): number {
  if (
    color.colorSpace !== "srgb" ||
    color.components.some((component) => component === "none") ||
    (color.alpha ?? 1) !== 1
  ) {
    throw new Error(
      `Contrast validation requires opaque concrete srgb colors; ${tokenId} is not supported.`,
    );
  }

  const [red, green, blue] = color.components as number[];
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

export function contrastRatio(
  foreground: DtcgColor,
  background: DtcgColor,
  foregroundId = "foreground",
  backgroundId = "background",
): number {
  const foregroundLuminance = relativeLuminance(foreground, foregroundId);
  const backgroundLuminance = relativeLuminance(background, backgroundId);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getColorToken(
  tokens: Record<string, TokenNormalized>,
  id: string,
): TokenNormalized {
  const token = tokens[id];

  if (!token) {
    throw new Error(`Contrast token "${id}" does not exist.`);
  }

  if (token.$type !== "color") {
    throw new Error(`Contrast token "${id}" must be a color token.`);
  }

  return token;
}

function validateContrastPair(
  tokens: Record<string, TokenNormalized>,
  pair: ContrastPair,
  theme: string,
): void {
  const foreground = getColorToken(tokens, pair.foreground);
  const background = getColorToken(tokens, pair.background);
  const ratio = contrastRatio(
    foreground.$value as DtcgColor,
    background.$value as DtcgColor,
    foreground.id,
    background.id,
  );

  if (ratio + Number.EPSILON < pair.minimum) {
    const label = pair.description ? ` (${pair.description})` : "";
    throw new Error(
      `${theme}: ${pair.foreground} on ${pair.background}${label} has contrast ${ratio.toFixed(2)}:1; expected at least ${pair.minimum}:1.`,
    );
  }
}

export function validateResolvedThemes(
  config: DesignSystemConfig,
  resolvedThemes: Map<string, Record<string, TokenNormalized>>,
): void {
  const tokenKeysByTheme = new Map<string, string[]>();

  for (const theme of config.themes) {
    const tokens = resolvedThemes.get(theme);
    if (!tokens) {
      throw new Error(`Theme "${theme}" was not resolved.`);
    }

    const tokenKeys = Object.keys(tokens).sort();
    tokenKeysByTheme.set(theme, tokenKeys);

    for (const requiredToken of config.requiredTokens ?? []) {
      if (!tokens[requiredToken]) {
        throw new Error(
          `${theme}: required token "${requiredToken}" is missing.`,
        );
      }
    }

    for (const pair of config.contrastPairs ?? []) {
      validateContrastPair(tokens, pair, theme);
    }
  }

  const referenceTheme = config.themes[0];
  const referenceKeys = tokenKeysByTheme.get(referenceTheme) ?? [];

  for (const theme of config.themes.slice(1)) {
    const keys = tokenKeysByTheme.get(theme) ?? [];
    if (JSON.stringify(keys) !== JSON.stringify(referenceKeys)) {
      const missing = referenceKeys.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !referenceKeys.includes(key));
      throw new Error(
        `${theme}: theme token parity failed. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`,
      );
    }
  }
}
