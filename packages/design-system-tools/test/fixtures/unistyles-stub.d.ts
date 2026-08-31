/* eslint-disable @typescript-eslint/no-empty-object-type */
// A faithful subset of the `react-native-unistyles@3.3.0` public typings, used
// as the module the AC-7.3 parity probe resolves so the suite does not have to
// install the real package (228 transitive packages / 172 MB, because
// `react-native` is a peer dependency of it).
//
// Copied shape-for-shape out of the real package, because the mechanism under
// test lives entirely in these declarations:
//   - lib/typescript/src/global.d.ts declares the two EMPTY interfaces that the
//     generated `unistyles.ts` augments.
//   - lib/typescript/src/types/core.d.ts derives `UnistylesTheme` by indexing
//     `UnistylesThemes` with its own `keyof`. With the augmentation missing,
//     `keyof {}` is `never`, so `theme` collapses to `never` and every consumer
//     property access fails. A stub typing `theme` as `any` or as a fixed shape
//     would pass even with the 1.13.F1 bug present and prove nothing.
//   - `UnistylesBreakpoints` ships only optional members, which makes it a weak
//     type: passing the generated breakpoints to `configure` is a TS2559 unless
//     the augmentation landed.

export interface UnistylesThemes {}

export interface UnistylesBreakpoints {
  landscape?: number;
  portrait?: number;
}

export type UnistylesTheme = UnistylesThemes[keyof UnistylesThemes];

export type UnistylesMiniRuntime = {
  insets: { top: number; bottom: number; left: number; right: number };
};

type UnistylesThemeSettings =
  | {
      initialTheme: (() => keyof UnistylesThemes) | keyof UnistylesThemes;
      adaptiveThemes?: never | false;
    }
  | { adaptiveThemes: boolean; initialTheme?: never }
  | { adaptiveThemes?: never; initialTheme?: never };

export type UnistylesConfig = {
  settings?: UnistylesThemeSettings & { CSSVars?: boolean };
  themes?: UnistylesThemes;
  breakpoints?: UnistylesBreakpoints;
};

export declare const StyleSheet: {
  configure(config: UnistylesConfig): void;
  create<S extends Record<string, unknown>>(
    stylesheet: (theme: UnistylesTheme, rt: UnistylesMiniRuntime) => S,
  ): S;
};

export declare const useUnistyles: () => {
  theme: UnistylesTheme;
  rt: UnistylesMiniRuntime;
};
