import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { URL } from "node:url";
import { scaffoldDesignSystem } from "../dist/index.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(join(tmpdir(), "assalabs-design-system-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("creates a web and native theme package in an empty workspace", async () => {
  await withWorkspace(async (directory) => {
    const result = await scaffoldDesignSystem({
      cwd: directory,
      name: "Example",
      scope: "@example",
      prefix: "ex",
      template: "none",
      brand: "#3366ff",
    });

    assert.ok(result.files.includes("packages/theme/package.json"));
    const packageJson = JSON.parse(
      await readFile(join(directory, "packages/theme/package.json"), "utf8"),
    );
    const toolsPackageJson = JSON.parse(
      await readFile(
        new URL("../../design-system-tools/package.json", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(packageJson.name, "@example/theme");
    assert.equal(
      packageJson.devDependencies["@assalabs/design-system-tools"],
      `^${toolsPackageJson.version}`,
    );
    assert.equal(packageJson.exports["./css"], "./styles/generated.css");
    assert.equal(
      packageJson.scripts.typecheck,
      "pnpm tokens:build && tsc --noEmit",
    );
    assert.ok(packageJson.exports["./native"]);
    assert.deepEqual(result.directories, [join(directory, "packages/theme")]);

    await assert.rejects(
      scaffoldDesignSystem({
        cwd: directory,
        name: "Example",
        scope: "@example",
        prefix: "ex",
        template: "none",
        brand: "#3366ff",
      }),
      /Refusing to overwrite existing directory/,
    );
  });
});

test("creates StyleX, Base UI, and Unistyles adapter packages", async () => {
  await withWorkspace(async (directory) => {
    const result = await scaffoldDesignSystem({
      cwd: directory,
      name: "Example",
      scope: "@example",
      prefix: "ex",
      template: "none",
      brand: "#3366ff",
      web: "stylex",
      native: "unistyles",
    });

    assert.deepEqual(result.directories, [
      join(directory, "packages/theme"),
      join(directory, "packages/ui-web"),
      join(directory, "packages/ui-native"),
    ]);
    assert.ok(result.files.includes("packages/ui-web/src/Button.tsx"));
    assert.ok(result.files.includes("packages/ui-native/src/Button.tsx"));

    const themePackage = JSON.parse(
      await readFile(join(directory, "packages/theme/package.json"), "utf8"),
    );
    const webPackage = JSON.parse(
      await readFile(join(directory, "packages/ui-web/package.json"), "utf8"),
    );
    const nativeConfig = await readFile(
      join(directory, "packages/ui-native/src/unistyles.ts"),
      "utf8",
    );
    const textField = await readFile(
      join(directory, "packages/ui-web/src/TextField.tsx"),
      "utf8",
    );
    assert.equal(
      themePackage.exports["./tokens.stylex.ts"],
      "./src/generated/tokens.stylex.ts",
    );
    assert.equal(
      themePackage.exports["./unistyles"],
      "./src/generated/unistyles.ts",
    );
    assert.equal(themePackage.peerDependencies["@stylexjs/stylex"], "^0.19.0");
    assert.equal(
      themePackage.peerDependencies["react-native-unistyles"],
      "^3.3.0",
    );
    assert.doesNotMatch(themePackage.scripts.build, /tokens\.stylex\.ts/);
    assert.doesNotMatch(themePackage.scripts.build, /generated\/unistyles\.ts/);
    const themeConfig = await readFile(
      join(directory, "packages/theme/design-system.config.mjs"),
      "utf8",
    );
    assert.match(
      themeConfig,
      /stylex: \{ file: "src\/generated\/tokens\.stylex\.ts" \}/,
    );
    assert.match(themeConfig, /unistyles: \{ dir: "src\/generated\/" \}/);
    assert.equal(webPackage.dependencies["@base-ui/react"], "^1.7.0");
    assert.equal(webPackage.dependencies["@stylexjs/stylex"], "^0.19.0");
    const nativePackage = JSON.parse(
      await readFile(
        join(directory, "packages/ui-native/package.json"),
        "utf8",
      ),
    );
    assert.equal(nativePackage.peerDependencies["react-native"], ">=0.78.0");
    assert.match(nativeConfig, /from "@example\/theme\/native"/);
    assert.match(textField, /invalid=\{Boolean\(error\)\}/);
    assert.match(textField, /match=\{true\}/);
    assert.doesNotMatch(nativeConfig, /{{[A-Z_]+}}/);
  });
});

test("creates a CSS Modules Base UI package", async () => {
  await withWorkspace(async (directory) => {
    const result = await scaffoldDesignSystem({
      cwd: directory,
      name: "Example",
      scope: "@example",
      prefix: "ex",
      template: "none",
      brand: "#3366ff",
      web: "css-modules",
      native: "none",
    });

    assert.ok(
      result.files.includes("packages/ui-web/src/components.module.css"),
    );
    const css = await readFile(
      join(directory, "packages/ui-web/src/components.module.css"),
      "utf8",
    );
    assert.match(css, /var\(--ex-color-action-primary-background\)/);
    assert.match(css, /display: inline-flex/);
    assert.match(css, /box-sizing: border-box/);
    assert.match(css, /align-items: center/);
    assert.doesNotMatch(css, /{{[A-Z_]+}}/);

    const textField = await readFile(
      join(directory, "packages/ui-web/src/TextField.tsx"),
      "utf8",
    );
    assert.match(textField, /invalid=\{Boolean\(error\)\}/);
    assert.match(textField, /match=\{true\}/);
  });
});

test("preflights every target and leaves no partial package", async () => {
  await withWorkspace(async (directory) => {
    await mkdir(join(directory, "packages/ui-web"), { recursive: true });

    await assert.rejects(
      scaffoldDesignSystem({
        cwd: directory,
        name: "Example",
        scope: "@example",
        prefix: "ex",
        template: "none",
        brand: "#3366ff",
        web: "stylex",
      }),
      /Refusing to overwrite existing directory/,
    );
    await assert.rejects(access(join(directory, "packages/theme")));
  });
});

test("aliases color.brand.primary to the generated brand anchor step", async () => {
  // `#123456` anchors at 900 and `#fff5f5` at 50; a hardcoded `.500` would
  // alias the brand token to a colour the user never picked.
  for (const [brand, anchor] of [
    ["#123456", 900],
    ["#fff5f5", 50],
    ["#00d4ff", 300],
  ]) {
    await withWorkspace(async (directory) => {
      await scaffoldDesignSystem({
        cwd: directory,
        name: "Example",
        scope: "@example",
        prefix: "ex",
        template: "none",
        brand,
      });

      const base = JSON.parse(
        await readFile(
          join(directory, "packages/theme/tokens/semantic/base.tokens.json"),
          "utf8",
        ),
      );
      assert.equal(
        base.color.brand.primary.$value,
        `{color.primitive.brand.${anchor}}`,
      );

      const primitives = JSON.parse(
        await readFile(
          join(
            directory,
            "packages/theme/tokens/primitives/colors.tokens.json",
          ),
          "utf8",
        ),
      );
      assert.ok(primitives.color.primitive.brand[String(anchor)]);
    });
  }
});

test("refuses an app template inside an existing monorepo", async () => {
  await withWorkspace(async (directory) => {
    await writeFile(join(directory, "package.json"), "{}\n", "utf8");

    await assert.rejects(
      scaffoldDesignSystem({
        cwd: directory,
        name: "Example",
        scope: "@example",
        prefix: "ex",
        template: "expo",
        brand: "#3366ff",
      }),
      /Refusing to overwrite existing file/,
    );
    await assert.rejects(access(join(directory, "packages/theme")));
  });
});
