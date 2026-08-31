import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import {
  contrastRatio,
  defineDesignSystem,
  generateDesignSystem,
  nativeThemePlugin,
  toNativeTokenValue,
} from "../dist/index.js";

const black = { colorSpace: "srgb", components: [0, 0, 0] };
const white = { colorSpace: "srgb", components: [1, 1, 1] };

function watcherConfig(source) {
  return `export default {
  name: "Watcher test",
  prefix: "watcher",
  source: ${JSON.stringify(source)},
  themes: ["light", "dark"],
  defaultTheme: "light",
  outputs: {
    css: "styles/generated.css",
    native: "src/generated/themes.ts",
    tokenNames: "src/generated/tokenNames.ts",
  },
};
`;
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1;
}

async function waitFor(predicate, diagnostics, timeout = 10_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeout) {
      throw new Error(
        `Timed out waiting for watcher output:\n${diagnostics()}`,
      );
    }
    await delay(25);
  }
}

const EXAMPLE_TOKENS = fileURLToPath(
  new URL("../../../examples/theme/tokens/", import.meta.url),
);

/**
 * Builds a throwaway theme from the example tokens with the StyleX adapter
 * switched on, so the adapter is exercised through the real Terrazzo pipeline
 * rather than against a hand-written token fixture.
 */
async function generateWithStylex(mutate) {
  const directory = await mkdtemp(join(tmpdir(), "assalabs-ds-stylex-"));

  try {
    await cp(EXAMPLE_TOKENS, join(directory, "tokens"), { recursive: true });
    await mutate?.(directory);

    const outputs = await generateDesignSystem({
      config: defineDesignSystem({
        name: "StyleX test",
        prefix: "ds",
        source: "./tokens/theme.resolver.json",
        themes: ["light", "dark"],
        defaultTheme: "light",
        outputs: {
          css: "styles/generated.css",
          stylex: { file: "src/generated/tokens.stylex.ts" },
        },
      }),
      configPath: join(directory, "design-system.config.mjs"),
      rootDirectory: directory,
    });

    const find = (filename) => {
      const output = outputs.find((entry) => entry.filename === filename);
      assert.ok(output, `Expected the build to emit ${filename}`);
      return String(output.contents);
    };

    return {
      css: find("styles/generated.css"),
      stylex: find("src/generated/tokens.stylex.ts"),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Body of the first `selector { ... }` rule in an unminified stylesheet. */
function ruleBody(css, selector) {
  const match = css.match(
    new RegExp(`(?:^|\\n)${selector.replaceAll(/[[\]"]/g, "\\$&")} \\{\\n`),
  );
  assert.ok(match, `Expected a ${selector} rule`);
  const start = match.index + match[0].length;
  return css.slice(start, css.indexOf("\n}", start));
}

/** Adds a camelCase colour role to both theme contexts of a copied token set. */
async function addCamelCaseRole(directory) {
  for (const [theme, primitive] of [
    ["light", "neutral.950"],
    ["dark", "white"],
  ]) {
    const path = join(directory, "tokens/semantic", `${theme}.tokens.json`);
    const tokens = JSON.parse(await readFile(path, "utf8"));
    tokens.color.text.onSurface = { $value: `{color.primitive.${primitive}}` };
    await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`);
  }
}

test("contrastRatio implements the WCAG relative-luminance calculation", () => {
  assert.equal(contrastRatio(black, white), 21);
});

test("contrastRatio rejects translucent colors", () => {
  assert.throws(
    () => contrastRatio({ ...black, alpha: 0.5 }, white),
    /opaque concrete srgb colors/,
  );
  assert.throws(
    () => contrastRatio(black, { ...white, alpha: 0 }),
    /opaque concrete srgb colors/,
  );
});

test("toNativeTokenValue converts DTCG colors and dimensions", () => {
  assert.equal(
    toNativeTokenValue({
      id: "color.brand.primary",
      $type: "color",
      $value: { colorSpace: "srgb", components: [1, 0.5, 0], alpha: 0.5 },
    }),
    "#ff800080",
  );
  assert.equal(
    toNativeTokenValue({
      id: "dimension.space.4",
      $type: "dimension",
      $value: { value: 16, unit: "px" },
    }),
    16,
  );
});

test("defineDesignSystem rejects unsafe prefixes", () => {
  assert.throws(
    () =>
      defineDesignSystem({
        name: "Example",
        prefix: "Bad Prefix",
        source: "tokens.json",
        themes: ["light", "dark"],
        defaultTheme: "light",
        outputs: { css: "tokens.css" },
      }),
    /prefix/,
  );
});

test("defineDesignSystem rejects unsafe or duplicate native theme names", () => {
  const config = {
    name: "Example",
    prefix: "example",
    source: "tokens.json",
    defaultTheme: "light",
    outputs: { native: "themes.ts" },
  };

  assert.throws(
    () => defineDesignSystem({ ...config, themes: ["light", "dark-mode"] }),
    /valid TypeScript identifier/,
  );
  assert.throws(
    () => defineDesignSystem({ ...config, themes: ["light", "light"] }),
    /duplicated/,
  );
});

test("native theme generation rejects normalized token path collisions", () => {
  const token = (id) => ({
    id,
    $type: "color",
    $value: black,
  });
  const plugin = nativeThemePlugin({
    filename: "themes.ts",
    themes: ["light"],
    themeModifier: "theme",
  });

  for (const tokens of [
    {
      "color.focus-ring": token("color.focus-ring"),
      "color.focusRing": token("color.focusRing"),
    },
    {
      "color.focus-ring.value": token("color.focus-ring.value"),
      "color.focusRing.other": token("color.focusRing.other"),
    },
  ]) {
    assert.throws(
      () =>
        plugin.build({
          resolver: { apply: () => tokens },
          outputFile: () => undefined,
        }),
      /Native token path collision/,
    );
  }
});

test("native theme generation rejects prototype-polluting token paths", () => {
  const plugin = nativeThemePlugin({
    filename: "themes.ts",
    themes: ["light"],
    themeModifier: "theme",
  });

  for (const id of ["__proto__.polluted", "color.__proto__.polluted"]) {
    assert.throws(
      () =>
        plugin.build({
          resolver: {
            apply: () => ({
              [id]: { id, $type: "color", $value: black },
            }),
          },
          outputFile: () => undefined,
        }),
      /cannot contain "__proto__"/,
    );
    assert.equal(Object.prototype.polluted, undefined);
  }
});

test(
  "watch mode ignores initial adds and follows config source changes",
  { timeout: 20_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "assalabs-ds-watch-"));
    const sourceTokens = fileURLToPath(
      new URL("../../../examples/theme/tokens/", import.meta.url),
    );
    const tokensA = join(directory, "tokens-a");
    const tokensB = join(directory, "tokens-b");
    const configPath = join(directory, "design-system.config.mjs");
    let output = "";
    let child;

    try {
      await cp(sourceTokens, tokensA, { recursive: true });
      await cp(sourceTokens, tokensB, { recursive: true });
      await writeFile(
        configPath,
        watcherConfig("./tokens-a/theme.resolver.json"),
      );

      child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../dist/cli.js", import.meta.url)),
          "tokens",
          "watch",
          "--config",
          configPath,
        ],
        { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
      );
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });

      await waitFor(
        () => output.includes("Watching"),
        () => output,
      );
      await delay(200);
      assert.equal(occurrences(output, "Built 3 design-system outputs."), 1);

      await writeFile(configPath, "");
      await delay(25);
      await writeFile(
        configPath,
        watcherConfig("./tokens-b/theme.resolver.json"),
      );
      await waitFor(
        () =>
          occurrences(output, "Built 3 design-system outputs.") >= 2 &&
          output.includes("tokens-b"),
        () => output,
      );
      assert.doesNotMatch(output, /No default export/);

      await unlink(configPath);
      await delay(150);
      await writeFile(
        configPath,
        watcherConfig("./tokens-b/theme.resolver.json"),
      );
      await waitFor(
        () => occurrences(output, "Built 3 design-system outputs.") >= 3,
        () => output,
      );
      assert.doesNotMatch(output, /config was not found/);

      const activeResolver = join(tokensB, "theme.resolver.json");
      await writeFile(
        activeResolver,
        `${await readFile(activeResolver, "utf8")}\n`,
      );
      await waitFor(
        () => occurrences(output, "Built 3 design-system outputs.") >= 4,
        () => output,
      );

      const oldResolver = join(tokensA, "theme.resolver.json");
      await writeFile(oldResolver, `${await readFile(oldResolver, "utf8")}\n`);
      await delay(300);
      assert.equal(occurrences(output, "Built 3 design-system outputs."), 4);
    } finally {
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("close", resolve));
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("the StyleX adapter aliases the generated custom properties for themed tokens", async () => {
  const { css, stylex } = await generateWithStylex();

  // StyleX 0.19 reads every non-`default` key of a value object as an at-rule,
  // so a `:root[data-theme="dark"]` key lowers to a dead descendant selector.
  // The adapter must not emit one.
  assert.doesNotMatch(stylex, /data-theme/);
  assert.doesNotMatch(stylex, /prefers-color-scheme/);
  assert.doesNotMatch(stylex, /\{\s*default:/);

  assert.match(stylex, /surfaceCanvas: "var\(--ds-color-surface-canvas\)"/);
  assert.match(stylex, /textPrimary: "var\(--ds-color-text-primary\)"/);

  // Groups that are the same in both themes stay literal, so StyleX can inline
  // them without depending on the stylesheet at all.
  const spacing = stylex.match(
    /export const spacing = stylex\.defineVars\(\{[^}]*\}\)/,
  );
  assert.ok(spacing, "Expected a spacing group");
  assert.doesNotMatch(spacing[0], /var\(/);
  assert.match(spacing[0], /"\d+px"/);

  // Every referenced property must exist in all three theme scopes, otherwise
  // the StyleX variable resolves to nothing in one of them.
  const referenced = [
    ...new Set([...stylex.matchAll(/var\((--ds-[\w-]+)\)/g)].map((m) => m[1])),
  ];
  assert.ok(referenced.length > 0, "Expected themed tokens to be aliased");

  for (const scope of [
    ":root",
    '[data-theme="light"]',
    '[data-theme="dark"]',
  ]) {
    const body = ruleBody(css, scope);
    const missing = referenced.filter((name) => !body.includes(`\n  ${name}:`));
    assert.deepEqual(missing, [], `Undeclared in ${scope}`);
  }

  // The whole point: flipping data-theme has to change the resolved value.
  const canvas = /--ds-color-surface-canvas: (.+);/;
  assert.notEqual(
    ruleBody(css, '[data-theme="light"]').match(canvas)[1],
    ruleBody(css, '[data-theme="dark"]').match(canvas)[1],
  );
});

test("the StyleX adapter references the name plugin-css really declares", async () => {
  const { css, stylex } = await generateWithStylex(addCamelCaseRole);

  // `@terrazzo/plugin-css` runs our `variableName` back through `makeCSSVar`,
  // which kebab-cases it, so `color.text.onSurface` is declared as
  // `--ds-color-text-on-surface`. Only alias tokens get the raw camelCase name
  // as well, so the kebab form is the one an adapter can rely on.
  assert.match(stylex, /textOnSurface: "var\(--ds-color-text-on-surface\)"/);
  assert.doesNotMatch(stylex, /--ds-color-text-onSurface/);
  assert.match(
    ruleBody(css, '[data-theme="dark"]'),
    /\n {2}--ds-color-text-on-surface:/,
  );
});

test("defineDesignSystem refuses a StyleX output without a CSS output", () => {
  assert.throws(
    () =>
      defineDesignSystem({
        name: "StyleX without CSS",
        prefix: "ds",
        source: "./tokens/theme.resolver.json",
        themes: ["light", "dark"],
        defaultTheme: "light",
        outputs: {
          native: "src/generated/themes.ts",
          stylex: { file: "src/generated/tokens.stylex.ts" },
        },
      }),
    /outputs\.stylex requires outputs\.css/,
  );
});
