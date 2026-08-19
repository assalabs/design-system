import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
    });

    assert.ok(result.files.includes("packages/theme/package.json"));
    const packageJson = JSON.parse(
      await readFile(join(directory, "packages/theme/package.json"), "utf8"),
    );
    const createPackageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.equal(packageJson.name, "@example/theme");
    assert.equal(
      packageJson.devDependencies["@assalabs/design-system-tools"],
      `^${createPackageJson.version}`,
    );
    assert.equal(packageJson.exports["./css"], "./styles/generated.css");
    assert.ok(packageJson.exports["./native"]);
    assert.deepEqual(result.directories, [join(directory, "packages/theme")]);

    await assert.rejects(
      scaffoldDesignSystem({
        cwd: directory,
        name: "Example",
        scope: "@example",
        prefix: "ex",
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
      web: "stylex",
      native: "unistyles",
    });

    assert.deepEqual(result.directories, [
      join(directory, "packages/theme"),
      join(directory, "packages/ui-web"),
      join(directory, "packages/ui-native"),
    ]);
    assert.ok(
      result.files.includes("packages/theme/src/generated/tokens.stylex.ts"),
    );
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
    assert.equal(
      themePackage.exports["./tokens.stylex.ts"],
      "./src/generated/tokens.stylex.ts",
    );
    assert.equal(webPackage.dependencies["@base-ui/react"], "^1.7.0");
    assert.equal(webPackage.dependencies["@stylexjs/stylex"], "^0.19.0");
    assert.match(nativeConfig, /from "@example\/theme\/native"/);
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
    assert.doesNotMatch(css, /{{[A-Z_]+}}/);
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
        web: "stylex",
      }),
      /Refusing to overwrite existing directory/,
    );
    await assert.rejects(access(join(directory, "packages/theme")));
  });
});
