import type { ScaffoldOptions, Template } from "./types.js";

/** Theme-relative path of the StyleX adapter output (`outputs.stylex.file`). */
export const STYLEX_OUTPUT_FILE = "src/generated/tokens.stylex.ts";

/** Theme-relative directory of the Unistyles adapter output (`outputs.unistyles.dir`). */
export const UNISTYLES_OUTPUT_DIR = "src/generated/";

/** The single file `emitUnistyles` writes into `UNISTYLES_OUTPUT_DIR`. */
export const UNISTYLES_OUTPUT_FILE = `${UNISTYLES_OUTPUT_DIR}unistyles.ts`;

const STYLEX_RANGE = "^0.19.0";
const UNISTYLES_RANGE = "^3.3.0";

/**
 * tsup bundles only the framework-free entrypoints. The adapter outputs stay
 * source-only: `tokens.stylex.ts` must reach the consumer's StyleX compiler
 * unbundled, and `unistyles.ts` carries a `declare module` augmentation that
 * only applies when TypeScript loads the source file (AC-3.4).
 */
const TSUP_ENTRIES: readonly string[] = ["src/index.ts", "src/native.ts"];

export type ThemeOutputs = {
  stylex?: { file: string };
  unistyles?: { dir: string };
};

export type ThemeWiring = {
  /** Emit `outputs.stylex` and export the StyleX token source. */
  stylex: boolean;
  /** Emit `outputs.unistyles` and export the Unistyles source. */
  unistyles: boolean;
  outputs: ThemeOutputs;
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional: true }>;
  /**
   * Extra type-only dependencies the theme needs to typecheck its own adapter
   * output. The adapter modules import these directly.
   */
  devDependencies: Record<string, string>;
  tsupEntries: readonly string[];
};

/**
 * Which adapters the scaffolded theme wires up.
 *
 * `expo` always means Unistyles and `web` always means StyleX; `none` scaffolds
 * only a theme (plus optional ui packages), so it follows `--web` / `--native`.
 */
export function resolveThemeWiring(options: ScaffoldOptions): ThemeWiring {
  const template: Template = options.template ?? "none";
  const stylex =
    template === "web" || (template === "none" && options.web === "stylex");
  const unistyles =
    template === "expo" ||
    (template === "none" && options.native === "unistyles");

  const outputs: ThemeOutputs = {};
  const exports: Record<string, unknown> = {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./native": { types: "./dist/native.d.ts", import: "./dist/native.js" },
    "./css": "./styles/generated.css",
  };
  const peerDependencies: Record<string, string> = {};
  const peerDependenciesMeta: Record<string, { optional: true }> = {};
  const devDependencies: Record<string, string> = {};

  if (stylex) {
    outputs.stylex = { file: STYLEX_OUTPUT_FILE };
    exports["./tokens.stylex.ts"] = `./${STYLEX_OUTPUT_FILE}`;
    peerDependencies["@stylexjs/stylex"] = STYLEX_RANGE;
    peerDependenciesMeta["@stylexjs/stylex"] = { optional: true };
    devDependencies["@stylexjs/stylex"] = STYLEX_RANGE;
  }

  if (unistyles) {
    outputs.unistyles = { dir: UNISTYLES_OUTPUT_DIR };
    exports["./unistyles"] = `./${UNISTYLES_OUTPUT_FILE}`;
    peerDependencies["react-native-unistyles"] = UNISTYLES_RANGE;
    peerDependenciesMeta["react-native-unistyles"] = { optional: true };
    devDependencies["react-native-unistyles"] = UNISTYLES_RANGE;
  }

  const tsupEntries = TSUP_ENTRIES.filter(
    (entry) => entry !== STYLEX_OUTPUT_FILE && entry !== UNISTYLES_OUTPUT_FILE,
  );

  return {
    stylex,
    unistyles,
    outputs,
    exports,
    peerDependencies,
    peerDependenciesMeta,
    devDependencies,
    tsupEntries,
  };
}
