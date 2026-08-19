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
