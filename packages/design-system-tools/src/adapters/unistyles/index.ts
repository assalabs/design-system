import { posix } from "node:path";
import type { TokenNormalized } from "@terrazzo/parser";
import { toNativeTokenValue } from "../../nativePlugin.js";
import type { DesignSystemConfig, GeneratedOutput } from "../../types.js";
import {
  assertLightDark,
  assertUniqueKey,
  camelKey,
  HEADER,
  propertyKey,
} from "../shared.js";

const ADAPTER = "unistyles";

/** Token id read for `spacing()` when `spacingBaseToken` is not configured. */
const DEFAULT_SPACING_BASE_TOKEN = "dimension.space.base";

/** Unistyles requires a breakpoint at 0; this one is injected when missing. */
const ZERO_BREAKPOINT_KEY = "xs";

const DEFAULT_SPACING_BASE = 8;

/** Path prefix of the tokens that become Unistyles breakpoints. */
const BREAKPOINT_PATH = ["dimension", "breakpoint"];

function toPosixPath(value: string): string {
  return value.split(/[\\/]+/).join("/");
}

function stripExtension(value: string): string {
  const extension = posix.extname(value);

  return extension ? value.slice(0, -extension.length) : value;
}

/**
 * Import specifier for the native themes file, relative to `outputs.unistyles.dir`.
 * The config validation only guarantees the themes file lives at or below `dir`,
 * so this is `./themes` when they share a directory and `./<sub>/themes` when the
 * native output is nested deeper.
 */
function themesSpecifier(directory: string, nativeFile: string): string {
  const from = posix.resolve("/", toPosixPath(directory));
  const to = stripExtension(posix.resolve("/", toPosixPath(nativeFile)));
  const specifier = posix.relative(from, to);

  if (specifier === "" || specifier.startsWith("..")) {
    throw new Error(
      `Adapter ${ADAPTER} cannot import "${nativeFile}" from "${directory}".`,
    );
  }

  return specifier.startsWith("./") ? specifier : `./${specifier}`;
}

function toPixels(token: TokenNormalized, label: string): number {
  const value = toNativeTokenValue(token);

  if (typeof value !== "number") {
    throw new Error(
      `Adapter ${ADAPTER} requires ${label} "${token.id}" to be a px dimension.`,
    );
  }

  return value;
}

type Breakpoint = {
  key: string;
  value: number;
};

/** Ascending by value, then by key, so the emitted object is deterministic. */
function compareBreakpoints(a: Breakpoint, b: Breakpoint): number {
  if (a.value !== b.value) {
    return a.value - b.value;
  }

  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function collectBreakpoints(
  tokens: ReadonlyMap<string, TokenNormalized>,
): Breakpoint[] {
  const breakpoints: Breakpoint[] = [];
  const taken = new Map<string, string>();

  for (const [id, token] of tokens) {
    const path = id.split(".");
    const [namespace, kind, ...rest] = path;

    if (
      namespace !== BREAKPOINT_PATH[0] ||
      kind !== BREAKPOINT_PATH[1] ||
      rest.length === 0
    ) {
      continue;
    }

    const key = camelKey(rest);
    assertUniqueKey(taken, "breakpoints", key, id);
    breakpoints.push({ key, value: toPixels(token, "breakpoint") });
  }

  breakpoints.sort(compareBreakpoints);

  if (breakpoints.some((breakpoint) => breakpoint.value === 0)) {
    return breakpoints;
  }

  if (taken.has(ZERO_BREAKPOINT_KEY)) {
    throw new Error(
      `Adapter ${ADAPTER} must inject "${ZERO_BREAKPOINT_KEY}: 0" because no breakpoint is 0, but "${taken.get(
        ZERO_BREAKPOINT_KEY,
      )}" already claims that key.`,
    );
  }

  return [{ key: ZERO_BREAKPOINT_KEY, value: 0 }, ...breakpoints];
}

function renderBreakpoints(breakpoints: readonly Breakpoint[]): string {
  return breakpoints
    .map(({ key, value }) => `${propertyKey(key)}: ${value}`)
    .join(", ");
}

/**
 * Emits a single `<dir>/unistyles.ts` with themes, breakpoints,
 * `configureUnistyles()` and the `react-native-unistyles` module augmentation.
 *
 * The augmentation is inlined rather than emitted as a sibling
 * `unistyles.d.ts`: TypeScript drops a declaration file shadowed by a
 * same-named `.ts` from wildcard-include programs, and module resolution
 * prefers the `.ts`, so a sibling declaration would never load.
 */
export function emitUnistyles(
  config: DesignSystemConfig,
  resolvedThemes: ReadonlyMap<string, Record<string, TokenNormalized>>,
): GeneratedOutput[] {
  const output = config.outputs.unistyles;

  if (!output) {
    throw new Error(
      `Adapter ${ADAPTER} requires outputs.unistyles to be configured.`,
    );
  }

  if (!config.outputs.native) {
    throw new Error(
      `Adapter ${ADAPTER} requires outputs.native to import the themes file.`,
    );
  }

  assertLightDark(config, ADAPTER);

  const light = resolvedThemes.get("light");
  const dark = resolvedThemes.get("dark");

  if (!light || !dark) {
    throw new Error(`Adapter ${ADAPTER} requires themes ["light","dark"]`);
  }

  const tokens = new Map<string, TokenNormalized>();

  for (const id of [
    ...new Set([...Object.keys(light), ...Object.keys(dark)]),
  ].sort()) {
    tokens.set(id, light[id] ?? (dark[id] as TokenNormalized));
  }

  const spacingBaseToken =
    output.spacingBaseToken ?? DEFAULT_SPACING_BASE_TOKEN;
  const spacingToken = tokens.get(spacingBaseToken);

  if (!spacingToken) {
    console.warn(
      `Adapter ${ADAPTER}: token "${spacingBaseToken}" not found, falling back to spacing base ${DEFAULT_SPACING_BASE}px.`,
    );
  }

  const spacingBase = spacingToken
    ? toPixels(spacingToken, "spacing base")
    : DEFAULT_SPACING_BASE;
  const breakpoints = collectBreakpoints(tokens);
  const specifier = themesSpecifier(output.dir, config.outputs.native);
  const directory = toPosixPath(output.dir);

  const module = `${HEADER}/* eslint-disable @typescript-eslint/no-empty-object-type */
import { StyleSheet } from "react-native-unistyles";
import { darkTheme, lightTheme } from ${JSON.stringify(specifier)};

const spacingBase = ${spacingBase}; // ${spacingBaseToken} (px), default ${DEFAULT_SPACING_BASE} when token absent

export const breakpoints = { ${renderBreakpoints(breakpoints)} } as const; // from ${BREAKPOINT_PATH.join(
    ".",
  )}.*; ${ZERO_BREAKPOINT_KEY}:0 injected if missing (Unistyles requires a 0 breakpoint)

function withHelpers<T extends object>(theme: T) {
  return { ...theme, spacing: (factor: number) => spacingBase * factor };
}

export const themes = {
  light: withHelpers(lightTheme),
  dark: withHelpers(darkTheme),
} as const;

export type AppThemes = typeof themes;
export type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

export function configureUnistyles() {
  StyleSheet.configure({ themes, breakpoints, settings: { adaptiveThemes: true } });
}
`;

  return [
    { filename: posix.join(directory, "unistyles.ts"), contents: module },
  ];
}
