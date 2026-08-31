import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import {
  defineDesignSystem,
  generateDesignSystem,
  loadDesignSystemConfig,
  writeGeneratedOutputs,
} from "../dist/index.js";

// The behavioural adapter assertions (emitted group shape, camelCase collision
// message, `assertLightDark` message, the derived `./themes` specifier, `xs: 0`
// injection, spacing base, and both `defineDesignSystem` adapter guards) live in
// `design-system-tools.test.mjs`. This file deliberately does not repeat them:
// it covers what those cannot — byte-level snapshots, the no-adapter-config
// regression against a pre-change build, and whether the emitted Unistyles
// module actually augments `react-native-unistyles` for a consumer (AC-7.3).

const EXAMPLE_THEME = fileURLToPath(
  new URL("../../../examples/theme/", import.meta.url),
);

const EXAMPLE_TOKENS = join(EXAMPLE_THEME, "tokens");

const UNISTYLES_STUB = fileURLToPath(
  new URL("./fixtures/unistyles-stub.d.ts", import.meta.url),
);

/**
 * The `tsconfig.probe.json` task 1.15 proved against the real
 * `react-native-unistyles@3.3.0`, verbatim. `include` is a WILDCARD on purpose:
 * a `files` list would name the augmentation explicitly and mask exactly the
 * shadowing bug 1.13.F1 fixed. `"types": []` keeps stray `@types/*` packages
 * out of the program.
 */
const PROBE_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022", "DOM"],
    module: "ESNext",
    moduleResolution: "bundler",
    jsx: "react-jsx",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
  include: ["src/**/*.ts", "src/**/*.tsx"],
  exclude: ["node_modules", "dist"],
};

/**
 * Consumer probe. The theme shape is NESTED (`theme.color.surface.canvas`),
 * because that is what `outputs.native` emits — the flat `surfaceCanvas` key
 * shape belongs to the StyleX file and does not compile here.
 *
 * `examples/theme` has no `color.bg` group (its colour groups are surface, text,
 * icon, border, action, feedback, focus), so this probes `color.surface.canvas`
 * rather than generating a palette token set just to reach `color.bg.canvas`.
 */
const PROBE_SOURCE = `import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  breakpoints,
  configureUnistyles,
  themes,
  type AppBreakpoints,
  type AppThemes,
} from "./generated/unistyles";

configureUnistyles();

export const md: number = breakpoints.md;
export const xs: 0 = breakpoints.xs;
export const light: keyof AppThemes = "light";
export const dark: keyof AppThemes = "dark";
// @ts-expect-error "default" is not one of the generated theme names.
export const notATheme: keyof AppThemes = "default";
export const breakpointName: keyof AppBreakpoints = "lg";

export function useProbe() {
  const { theme } = useUnistyles();
  const gap: number = theme.spacing(2);
  const canvas: string = theme.color.surface.canvas;
  const radiusMd: number = theme.dimension.radius.md;

  return { gap, canvas, radiusMd };
}

export const styles = StyleSheet.create((theme, rt) => ({
  box: {
    backgroundColor: theme.color.surface.canvas,
    borderRadius: theme.dimension.radius.md,
    padding: theme.spacing(2),
    paddingTop: rt.insets.top,
  },
}));

export const themeNames = Object.keys(themes);
`;

const TSC = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin/tsc",
);

/**
 * Reads a committed snapshot, writing it only when a human opted in.
 *
 * Writing on absence and then asserting against what was just written makes any
 * regression self-blessing: delete the file, re-run, green. Task 3.1.F1 proved
 * that on the palette snapshot (a mutated compat alias passed 15/15 with the
 * snapshot missing), so every snapshot in this directory carries the guard.
 */
function readSnapshot(name, actual) {
  const path = fileURLToPath(
    new URL(`./__snapshots__/${name}`, import.meta.url),
  );

  if (!existsSync(path)) {
    assert.ok(
      process.env.UPDATE_SNAPSHOTS === "1",
      `snapshot missing: ${path} - re-create deliberately with UPDATE_SNAPSHOTS=1`,
    );
    writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

/** Compares every key both ways, so a dropped or added output is a failure. */
function assertMatchesSnapshot(actual, snapshot) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(snapshot).sort());

  for (const key of Object.keys(snapshot)) {
    assert.equal(
      actual[key],
      snapshot[key],
      `${key} drifted from the snapshot`,
    );
  }
}

/**
 * Builds a throwaway theme from a copy of the example tokens with both adapters
 * switched on, and returns every output keyed by filename.
 */
async function generateOutputs(mutate) {
  const directory = await mkdtemp(join(tmpdir(), "assalabs-ds-adapters-"));

  try {
    await cp(EXAMPLE_TOKENS, join(directory, "tokens"), { recursive: true });
    await mutate?.(directory);

    const outputs = await generateDesignSystem({
      config: defineDesignSystem({
        name: "Example",
        prefix: "ds",
        source: "./tokens/theme.resolver.json",
        themes: ["light", "dark"],
        defaultTheme: "light",
        outputs: {
          css: "styles/generated.css",
          native: "src/generated/themes.ts",
          tokenNames: "src/generated/tokenNames.ts",
          stylex: { file: "src/generated/tokens.stylex.ts" },
          unistyles: { dir: "src/generated" },
        },
      }),
      configPath: join(directory, "design-system.config.mjs"),
      rootDirectory: directory,
    });

    return Object.fromEntries(
      outputs.map((output) => [output.filename, String(output.contents)]),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The `key: "value"` pairs of one `stylex.defineVars` block. */
function defineVarsEntries(module, group) {
  const match = module.match(
    new RegExp(
      `export const ${group} = stylex\\.defineVars\\(\\{\\n(.*?)\\n\\}\\);`,
      "s",
    ),
  );
  assert.ok(match, `Expected a ${group} group`);

  return match[1].split("\n").map((line) => {
    const entry = line.match(/^ {2}(.+?): (".*"),$/);
    assert.ok(entry, `Unparsed defineVars line: ${line}`);
    return { key: entry[1], value: JSON.parse(entry[2]) };
  });
}

/** Gives `dimension.radius.themed` a different value in each theme context. */
async function addThemedDimension(directory) {
  for (const [theme, pixels] of [
    ["light", 4],
    ["dark", 24],
  ]) {
    const path = join(directory, "tokens/semantic", `${theme}.tokens.json`);
    const tokens = JSON.parse(await readFile(path, "utf8"));
    tokens.dimension = {
      radius: {
        $type: "dimension",
        themed: { $value: { value: pixels, unit: "px" } },
      },
    };
    await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`);
  }
}

/** Drops the inline `declare module` block, keeping the rest of the module. */
function stripAugmentation(source) {
  const stripped = source.replace(
    /declare module "react-native-unistyles" \{[\s\S]*?\n\}\n/,
    "",
  );
  assert.notEqual(stripped, source, "the augmentation block was not found");
  assert.doesNotMatch(stripped, /declare module/);

  return stripped;
}

/** Runs `tsc --noEmit` over the probe program; returns exit status and output. */
function typecheckProbe(directory) {
  try {
    execFileSync(
      process.execPath,
      [TSC, "--noEmit", "-p", join(directory, "tsconfig.probe.json")],
      { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/**
 * Writes a real consumer package around the generated theme: the emitted files,
 * a `node_modules/react-native-unistyles` the stub typings resolve through
 * (plain node resolution, no tsconfig `paths` fakery), the probe module, and
 * the 1.15 tsconfig.
 */
async function buildProbe() {
  const directory = await mkdtemp(join(tmpdir(), "assalabs-ds-parity-"));
  await cp(EXAMPLE_TOKENS, join(directory, "tokens"), { recursive: true });

  const loaded = {
    config: defineDesignSystem({
      name: "Parity probe",
      prefix: "ds",
      source: "./tokens/theme.resolver.json",
      themes: ["light", "dark"],
      defaultTheme: "light",
      outputs: {
        native: "src/generated/themes.ts",
        tokenNames: "src/generated/tokenNames.ts",
        unistyles: { dir: "src/generated" },
      },
    }),
    configPath: join(directory, "design-system.config.mjs"),
    rootDirectory: directory,
  };

  await writeGeneratedOutputs(loaded, await generateDesignSystem(loaded));

  const stub = join(directory, "node_modules/react-native-unistyles");
  await mkdir(stub, { recursive: true });
  await writeFile(
    join(stub, "package.json"),
    `${JSON.stringify(
      {
        name: "react-native-unistyles",
        version: "3.3.0",
        types: "index.d.ts",
        exports: { ".": { types: "./index.d.ts" } },
      },
      null,
      2,
    )}\n`,
  );
  await cp(UNISTYLES_STUB, join(stub, "index.d.ts"));

  await writeFile(join(directory, "src/probe.ts"), PROBE_SOURCE);
  await writeFile(
    join(directory, "tsconfig.probe.json"),
    `${JSON.stringify(PROBE_TSCONFIG, null, 2)}\n`,
  );

  return directory;
}

test("the adapter outputs match their committed snapshots", async () => {
  const outputs = await generateOutputs();
  const actual = {
    "src/generated/tokens.stylex.ts": outputs["src/generated/tokens.stylex.ts"],
    "src/generated/unistyles.ts": outputs["src/generated/unistyles.ts"],
  };

  for (const [filename, contents] of Object.entries(actual)) {
    assert.ok(contents, `Expected the build to emit ${filename}`);
  }

  assertMatchesSnapshot(
    actual,
    readSnapshot("adapters-example-theme.json", actual),
  );
});

test("every StyleX color is a flat var() reference to the stylesheet", async () => {
  const stylex = (await generateOutputs())["src/generated/tokens.stylex.ts"];

  // `unstable_defineVarsNested` would produce a nested var group the theme
  // package's consumers cannot address with the flat camelCase keys.
  assert.doesNotMatch(stylex, /defineVarsNested/);

  const colors = defineVarsEntries(stylex, "colors");
  assert.ok(colors.length > 50, `Only ${colors.length} colors emitted`);

  for (const { key, value } of colors) {
    assert.match(
      value,
      /^var\(--ds-color-[a-z0-9-]+\)$/,
      `colors.${key} is not a var() reference`,
    );
  }

  // `emitStylex` treats a token as themed when it is a color OR when its light
  // and dark values disagree, so these two — identical in both themes — are
  // aliased only because of the `isColor` half of that test.
  const byKey = new Map(colors.map((entry) => [entry.key, entry.value]));
  assert.equal(byKey.get("brandPrimary"), "var(--ds-color-brand-primary)");
  assert.equal(byKey.get("primitiveWhite"), "var(--ds-color-primitive-white)");

  // Every non-color group in THIS token set is theme-invariant, so it stays a
  // literal. That is a property of `examples/theme`, not a rule about groups:
  // the test below adds a themed dimension and it is aliased like a color.
  for (const group of ["spacing", "radius", "fonts", "motion"]) {
    for (const { key, value } of defineVarsEntries(stylex, group)) {
      assert.doesNotMatch(
        value,
        /var\(/,
        `${group}.${key} should be a literal`,
      );
    }
  }
});

test("a non-color token whose themes disagree is aliased too", async () => {
  const outputs = await generateOutputs(addThemedDimension);
  const radius = new Map(
    defineVarsEntries(outputs["src/generated/tokens.stylex.ts"], "radius").map(
      (entry) => [entry.key, entry.value],
    ),
  );

  assert.equal(radius.get("themed"), "var(--ds-dimension-radius-themed)");
  // The theme-invariant siblings in the same group are untouched.
  assert.equal(radius.get("md"), "12px");
});

test("a config without adapter outputs still builds the pre-change bytes", async () => {
  // The real committed example config, so this fails if `examples/theme` ever
  // gains adapter keys and stops being the no-config case.
  const loaded = await loadDesignSystemConfig(
    "design-system.config.mjs",
    EXAMPLE_THEME,
  );
  assert.equal(loaded.config.outputs.stylex, undefined);
  assert.equal(loaded.config.outputs.unistyles, undefined);

  const outputs = await generateDesignSystem(loaded);
  const actual = Object.fromEntries(
    outputs.map((output) => [output.filename, String(output.contents)]),
  );

  // Generated by running `codex/bootstrap-design-system`'s dist against TODAY's
  // example tokens, so the fixture isolates the code change from task 1.14's
  // `dimension.space.base` token addition. The allowed delta is therefore zero.
  assertMatchesSnapshot(
    actual,
    readSnapshot("example-theme-outputs.json", actual),
  );
  assert.deepEqual(Object.keys(actual), [
    "styles/generated.css",
    "src/generated/themes.ts",
    "src/generated/tokenNames.ts",
  ]);
});

test(
  "the emitted unistyles module augments react-native-unistyles for a consumer",
  { timeout: 120_000 },
  async () => {
    const directory = await buildProbe();

    try {
      const module = join(directory, "src/generated/unistyles.ts");
      const source = await readFile(module, "utf8");

      // The augmentation is INLINE (decision 14): a sibling `unistyles.d.ts` is
      // dropped from a wildcard-include program by TypeScript's
      // lower-priority-extension dedup, so it would never load.
      assert.match(source, /declare module "react-native-unistyles" \{/);
      assert.ok(!existsSync(join(directory, "src/generated/unistyles.d.ts")));

      const checked = typecheckProbe(directory);
      assert.ok(checked.ok, `tsc rejected the probe:\n${checked.output}`);

      // Negative control: without the augmentation, `UnistylesThemes` is empty,
      // `UnistylesTheme` indexes it with `keyof {}` = never, and every consumer
      // property access fails. Proving the probe CAN fail is what stops a
      // permissive stub or a mis-wired tsconfig from making this test vacuous.
      await writeFile(module, stripAugmentation(source));
      const control = typecheckProbe(directory);
      assert.equal(
        control.ok,
        false,
        "the probe cannot fail; it proves nothing",
      );
      assert.match(control.output, /'never'/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
