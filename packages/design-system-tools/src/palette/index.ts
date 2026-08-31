import { deriveSeeds, type PaletteInput } from "./derive.js";
import { emitPrimitives, emitSemantic, RAMP_ORDER } from "./emit.js";
import { buildRamp, type Ramp, type Step } from "./ladder.js";
import {
  selectRoles,
  type RampName,
  type RoleId,
  type Theme,
  type TokenRef,
} from "./semantic.js";

export type { PaletteInput } from "./derive.js";
export type { RoleId, TokenRef } from "./semantic.js";

export interface PaletteReportEntry {
  /** `"<fg role>/<bg role>"`, e.g. `"fg.muted/bg.surface"`. */
  pair: string;
  theme: Theme;
  ratio: number;
  minimum: number;
}

export interface PaletteFiles {
  "primitives/colors.tokens.json": string;
  "semantic/light.tokens.json": string;
  "semantic/dark.tokens.json": string;
}

export interface PaletteResult {
  primitives: Record<RampName, Ramp>;
  anchors: { brand: Step; neutral: Step; accent: Step };
  semantic: {
    light: Record<RoleId, TokenRef>;
    dark: Record<RoleId, TokenRef>;
  };
  files: PaletteFiles;
  report: PaletteReportEntry[];
}

/**
 * One seed color in, a full DTCG palette out. Pure: no IO, no randomness, no
 * time, so two calls with the same input produce identical strings.
 *
 * Throws `PaletteError` on an invalid seed hex (validated in `deriveSeeds`, the
 * single hex validator) or when no candidate satisfies a contrast pair.
 */
export function generatePalette(input: PaletteInput): PaletteResult {
  const seeds = deriveSeeds(input);

  const built = {} as Record<RampName, { ramp: Ramp; anchor: Step }>;
  for (const name of RAMP_ORDER) {
    const seed = seeds[name];
    built[name] = buildRamp(seed.seedHex, { anchor: seed.anchor });
  }

  const light = selectRoles(built, "light");
  const dark = selectRoles(built, "dark");

  const primitives = {} as Record<RampName, Ramp>;
  for (const name of RAMP_ORDER) {
    primitives[name] = built[name].ramp;
  }

  const report: PaletteReportEntry[] = (
    [
      ["light", light],
      ["dark", dark],
    ] as const
  ).flatMap(([theme, result]) =>
    result.report.map((entry) => ({
      pair: `${entry.fg}/${entry.bg}`,
      theme,
      ratio: entry.ratio,
      minimum: entry.minimum,
    })),
  );

  return {
    primitives,
    anchors: {
      brand: built.brand.anchor,
      neutral: built.neutral.anchor,
      accent: built.accent.anchor,
    },
    semantic: { light: light.roles, dark: dark.roles },
    files: {
      "primitives/colors.tokens.json": emitPrimitives(primitives),
      "semantic/light.tokens.json": emitSemantic(light.roles),
      "semantic/dark.tokens.json": emitSemantic(dark.roles),
    },
    report,
  };
}
