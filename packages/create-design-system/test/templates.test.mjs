import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { SCAFFOLD_CONTRAST_PAIRS } from "@assalabs/design-system-tools";

// These tests drive `dist/cli.js` as a real child process. Half of what they
// assert IS the process contract -- exit codes, which stream a message lands
// on, `--yes` flag parsing -- and the other half is the tree the CLI leaves on
// disk, which is what a user actually gets.

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const TEMPLATE_ROOT = fileURLToPath(new URL("../template/", import.meta.url));

const TOOLS_PACKAGE = fileURLToPath(
  new URL("../../design-system-tools/", import.meta.url),
);

const TOOLS_CLI = join(TOOLS_PACKAGE, "dist/cli.js");

const SCOPE = "@foo";
const PREFIX = "fb";

/** Anchors the brand ramp at step 900, well away from a hardcoded `.500`. */
const BRAND = "#123456";
const BRAND_ANCHOR = 900;

/** The exact lines `configFile` emits for each adapter output. */
const STYLEX_OUTPUT = `    stylex: { file: "src/generated/tokens.stylex.ts" },`;
const UNISTYLES_OUTPUT = `    unistyles: { dir: "src/generated/" },`;

/**
 * Placeholder shape, deliberately narrower than a bare `{{`: the Unistyles
 * components legitimately ship JSX like `accessibilityState={{ checked }}` and
 * a multi-line `trackColor={{ ... }}`, neither of which is a placeholder.
 */
const PLACEHOLDER = /\{\{[A-Za-z_]+\}\}/g;

const TEMPLATES = {
  expo: {
    initArgs: ["--template", "expo"],
    stylex: false,
    unistyles: true,
    shipsWorkspaceRoot: true,
    packages: ["theme"],
    templateDirectories: ["expo", "theme"],
    present: ["apps/mobile/App.tsx", "apps/mobile/app.json"],
    absent: ["apps/web/package.json"],
  },
  "web-rsbuild": {
    initArgs: ["--template", "web", "--bundler", "rsbuild"],
    stylex: true,
    unistyles: false,
    shipsWorkspaceRoot: true,
    packages: ["theme"],
    templateDirectories: ["web-rsbuild", "theme"],
    present: ["apps/web/rsbuild.config.ts", "apps/web/static/index.html"],
    absent: ["apps/web/vite.config.ts", "apps/mobile/App.tsx"],
  },
  "web-vite": {
    initArgs: ["--template", "web", "--bundler", "vite"],
    stylex: true,
    unistyles: false,
    shipsWorkspaceRoot: true,
    packages: ["theme"],
    templateDirectories: ["web-vite", "theme"],
    present: ["apps/web/vite.config.ts", "apps/web/index.html"],
    absent: ["apps/web/rsbuild.config.ts", "apps/mobile/App.tsx"],
  },
  // `--web` / `--native` default to stylex / unistyles in `parseOptions`, and
  // `resolveThemeWiring` honours both for `template === "none"` -- so the
  // default `none` scaffold wires BOTH adapters and both ui packages. "neither"
  // is only true with the adapters explicitly turned off, covered separately.
  none: {
    initArgs: ["--template", "none"],
    stylex: true,
    unistyles: true,
    shipsWorkspaceRoot: false,
    packages: ["theme", "ui-native", "ui-web"],
    templateDirectories: ["theme", "ui-web/stylex", "ui-native/unistyles"],
    present: [
      "packages/ui-web/src/styles.stylex.ts",
      "packages/ui-native/src/unistyles.ts",
    ],
    absent: [],
  },
  // The CSS Modules ui package is the one template directory no other row
  // renders, and it holds every `{{PREFIX}}` the templates ship -- so without
  // this row the placeholder scan never sees that placeholder at all.
  "none-css-modules": {
    initArgs: [
      "--template",
      "none",
      "--web",
      "css-modules",
      "--native",
      "none",
    ],
    stylex: false,
    unistyles: false,
    shipsWorkspaceRoot: false,
    packages: ["theme", "ui-web"],
    templateDirectories: ["theme", "ui-web/css-modules"],
    present: ["packages/ui-web/src/components.module.css"],
    absent: ["packages/ui-web/src/styles.stylex.ts"],
  },
};

const WEB_TEMPLATES = ["web-rsbuild", "web-vite"];

const toolsVersion = JSON.parse(
  await readFile(join(TOOLS_PACKAGE, "package.json"), "utf8"),
).version;

function runNode(args, cwd) {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      args,
      { cwd, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolveRun({ code: error ? (error.code ?? 1) : 0, stdout, stderr });
      },
    );
  });
}

/**
 * `mkdtemp` hands back `/var/folders/...` on macOS, a symlink to
 * `/private/var/folders/...`. The scaffolder prints refusal paths as absolute
 * `resolve(cwd, ...)` output, so resolving here keeps those strings comparable.
 */
async function createTarget(t) {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "assalabs-ds-template-")),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function runInit(target, extraArgs) {
  return runNode(
    [
      CLI,
      "init",
      "--cwd",
      target,
      "--name",
      "Foo",
      "--scope",
      SCOPE,
      "--prefix",
      PREFIX,
      ...extraArgs,
    ],
    target,
  );
}

/** Every scaffolded file keyed by its path relative to the target. */
async function readTree(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const files = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const path = relative(directory, join(entry.parentPath, entry.name));
    if (path.split("/")[0] === "node_modules") {
      continue;
    }

    files.set(path, await readFile(join(directory, path), "utf8"));
  }

  return files;
}

function topLevel(tree, directoryName) {
  return [...tree.keys()].filter(
    (path) => path.split("/")[0] === directoryName,
  );
}

function packageDirectories(tree) {
  return [
    ...new Set(topLevel(tree, "packages").map((path) => path.split("/")[1])),
  ].sort();
}

function leftoverPlaceholders(tree) {
  return [...tree]
    .flatMap(([path, contents]) =>
      [...contents.matchAll(PLACEHOLDER)].map(
        (match) => `${path}: ${match[0]}`,
      ),
    )
    .sort();
}

/** `ui-web/stylex` and `ui-native/unistyles` are two levels deep; the rest one. */
function templateDirectoryOf(path) {
  const parts = path.split("/");
  return parts[0] === "ui-web" || parts[0] === "ui-native"
    ? `${parts[0]}/${parts[1]}`
    : parts[0];
}

test("the placeholder scan covers every shipped template", async () => {
  const shippedTree = await readTree(TEMPLATE_ROOT);

  // Every "no placeholders remain" assertion below leans on PLACEHOLDER
  // actually matching what the templates ship. If a rename ever made it match
  // nothing, the scan would pass on any output at all.
  const placeholders = new Set(
    leftoverPlaceholders(shippedTree).map((entry) =>
      entry.slice(entry.indexOf(": ") + 2),
    ),
  );
  assert.ok(
    placeholders.size >= 6,
    `templates ship ${placeholders.size} placeholders`,
  );
  for (const placeholder of [
    "{{scope}}",
    "{{PREFIX}}",
    "{{DESIGN_SYSTEM_NAME}}",
  ]) {
    assert.ok(
      placeholders.has(placeholder),
      `${placeholder} is not in a template`,
    );
  }

  // ... and a scan of scaffolds that never render a given template directory
  // says nothing about it. `{{PREFIX}}` lives ONLY in the CSS Modules package,
  // so a table that skipped it would never see that placeholder at all.
  assert.deepEqual(
    [...new Set([...shippedTree.keys()].map(templateDirectoryOf))].sort(),
    [
      ...new Set(
        Object.values(TEMPLATES).flatMap(
          (definition) => definition.templateDirectories,
        ),
      ),
    ].sort(),
  );
});

for (const [name, definition] of Object.entries(TEMPLATES)) {
  test(`${name} renders a complete scaffold`, async (t) => {
    const target = await createTarget(t);

    const result = await runInit(target, [
      ...definition.initArgs,
      "--brand",
      BRAND,
      "--yes",
    ]);
    assert.equal(result.code, 0, result.stderr);

    const tree = await readTree(target);

    assert.deepEqual(leftoverPlaceholders(tree), []);
    assert.deepEqual(packageDirectories(tree), definition.packages);
    for (const path of definition.present) {
      assert.ok(tree.has(path), `${path} is missing`);
    }
    for (const path of definition.absent) {
      assert.equal(tree.has(path), false, `${path} should not exist`);
    }

    const config = tree.get("packages/theme/design-system.config.mjs");
    assert.equal(
      config.includes(STYLEX_OUTPUT),
      definition.stylex,
      `outputs.stylex should be ${definition.stylex ? "present" : "absent"}`,
    );
    assert.equal(
      config.includes(UNISTYLES_OUTPUT),
      definition.unistyles,
      `outputs.unistyles should be ${definition.unistyles ? "present" : "absent"}`,
    );

    // `tokens check` re-asserts exactly what `generatePalette` promised, so the
    // config has to carry every pair -- not a truncated subset.
    for (const pair of SCAFFOLD_CONTRAST_PAIRS) {
      assert.ok(
        config.includes(
          `      foreground: "color.${pair.fg}",\n` +
            `      background: "color.${pair.bg}",\n` +
            `      minimum: ${pair.minimum},\n`,
        ),
        `contrastPairs is missing ${pair.fg} on ${pair.bg}`,
      );
    }
    assert.equal(
      config.match(/foreground: /g)?.length,
      SCAFFOLD_CONTRAST_PAIRS.length,
    );

    // Read live: a scaffold pinned to a stale tools version installs an
    // initializer that cannot emit the outputs its own config asks for.
    assert.match(toolsVersion, /^\d+\.\d+\.\d+/);
    const themePackage = JSON.parse(tree.get("packages/theme/package.json"));
    assert.equal(
      themePackage.devDependencies["@assalabs/design-system-tools"],
      `^${toolsVersion}`,
    );

    // Both adapter outputs are exported as SOURCE: `tokens build` writes them
    // under `src/generated/`, and neither survives the tsup bundle intact.
    assert.equal(
      themePackage.exports["./tokens.stylex.ts"],
      definition.stylex ? "./src/generated/tokens.stylex.ts" : undefined,
    );
    assert.equal(
      themePackage.exports["./unistyles"],
      definition.unistyles ? "./src/generated/unistyles.ts" : undefined,
    );

    if (!definition.shipsWorkspaceRoot) {
      // `--template none` drops into somebody else's monorepo: everything it
      // writes lives under `packages/`, root files and CI included.
      assert.deepEqual(
        [...tree.keys()].filter((path) => !path.startsWith("packages/")),
        [],
      );
      return;
    }

    const rootPackage = JSON.parse(tree.get("package.json"));
    assert.equal(
      rootPackage.scripts["build:theme"],
      `pnpm --filter ${SCOPE}/theme build`,
    );
    assert.equal(
      rootPackage.scripts["check:theme"],
      `pnpm --filter ${SCOPE}/theme tokens:check`,
    );
    assert.match(
      tree.get(".github/workflows/theme-check.yml"),
      /run: pnpm check:theme/,
    );

    // `npm pack` strips `.gitignore` and `.npmrc`, so the templates ship them
    // dot-less and `TEMPLATE_FILENAME_ALIASES` restores the dotted name on
    // write. Assert both halves: the dotted file lands, the dot-less one does
    // not, and each has the content that makes it worth shipping.
    assert.match(tree.get(".gitignore"), /node_modules/);
    assert.match(tree.get(".npmrc"), /node-linker=hoisted/);
    assert.equal(tree.has("gitignore"), false);
    assert.equal(tree.has("npmrc"), false);
  });
}

test("--web none --native none wires neither adapter", async (t) => {
  const target = await createTarget(t);

  const result = await runInit(target, [
    "--template",
    "none",
    "--web",
    "none",
    "--native",
    "none",
    "--brand",
    BRAND,
    "--yes",
  ]);
  assert.equal(result.code, 0, result.stderr);

  const tree = await readTree(target);
  const config = tree.get("packages/theme/design-system.config.mjs");
  assert.equal(config.includes(STYLEX_OUTPUT), false);
  assert.equal(config.includes(UNISTYLES_OUTPUT), false);

  const themePackage = JSON.parse(tree.get("packages/theme/package.json"));
  assert.equal(themePackage.peerDependencies, undefined);
  assert.equal(themePackage.peerDependenciesMeta, undefined);
  assert.equal(themePackage.exports["./tokens.stylex.ts"], undefined);
  assert.equal(themePackage.exports["./unistyles"], undefined);
  assert.deepEqual(packageDirectories(tree), ["theme"]);
});

for (const name of WEB_TEMPLATES) {
  test(`${name} exports the StyleX token source unbundled`, async (t) => {
    const target = await createTarget(t);

    const result = await runInit(target, [
      ...TEMPLATES[name].initArgs,
      "--brand",
      BRAND,
      "--yes",
    ]);
    assert.equal(result.code, 0, result.stderr);

    const themePackage = JSON.parse(
      await readFile(join(target, "packages/theme/package.json"), "utf8"),
    );

    assert.equal(themePackage.peerDependencies["@stylexjs/stylex"], "^0.19.0");
    assert.deepEqual(themePackage.peerDependenciesMeta["@stylexjs/stylex"], {
      optional: true,
    });
    // AC-3.4: the StyleX compiler has to see the SOURCE module. A `dist/`
    // target would hand it bundled output with the var calls already inlined.
    assert.equal(
      themePackage.exports["./tokens.stylex.ts"],
      "./src/generated/tokens.stylex.ts",
    );
    for (const script of [
      themePackage.scripts.build,
      themePackage.scripts.dev,
    ]) {
      assert.match(script, /tsup src\/index\.ts src\/native\.ts /);
      assert.doesNotMatch(script, /tokens\.stylex\.ts/);
      assert.doesNotMatch(script, /generated\/unistyles\.ts/);
    }
  });
}

test("--yes without --brand fails before writing anything", async (t) => {
  const target = await createTarget(t);

  const result = await runInit(target, ["--template", "expo", "--yes"]);

  assert.equal(result.code, 1);
  // The dedicated message, not `assertHex`'s `(got "undefined")` fallback.
  assert.equal(result.stderr, "--brand is required with --yes\n");
  assert.doesNotMatch(result.stderr, /\n\s+at /);
  assert.deepEqual([...(await readTree(target)).keys()], []);
});

test("an app template refuses an existing workspace root", async (t) => {
  const target = await createTarget(t);
  await writeFile(join(target, "package.json"), "{}\n", "utf8");

  const result = await runInit(target, [
    "--template",
    "expo",
    "--brand",
    BRAND,
    "--yes",
  ]);

  assert.equal(result.code, 1);
  assert.equal(
    result.stderr,
    `Refusing to overwrite existing file: ${join(target, "package.json")}. ` +
      "Use --template none inside an existing monorepo.\n",
  );
  // Preflight, not mid-write: the user's file survives and nothing else lands.
  assert.deepEqual([...(await readTree(target)).keys()], ["package.json"]);
});

test("an app template keeps a pre-existing README and reports the skip", async (t) => {
  const target = await createTarget(t);
  // `git init` + `README.md` is a normal starting state, not a monorepo, so it
  // must not trip the same refusal `package.json` does.
  const original = "# mine\n\nNotes written before scaffolding.\n";
  await writeFile(join(target, "README.md"), original, "utf8");

  const result = await runInit(target, [
    "--template",
    "expo",
    "--brand",
    BRAND,
    "--yes",
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(target, "README.md"), "utf8"), original);
  assert.match(
    result.stdout,
    /^SKIP {3}README\.md \(already exists, kept yours\)$/m,
  );
  assert.doesNotMatch(result.stdout, /^CREATE README\.md$/m);

  const tree = await readTree(target);
  assert.ok(tree.has("package.json"));
  assert.ok(tree.has("apps/mobile/App.tsx"));
});

test(
  "a scaffolded theme builds its tokens and aliases brand.primary at the anchor",
  { timeout: 180_000 },
  async (t) => {
    const target = await createTarget(t);

    const scaffolded = await runInit(target, [
      "--template",
      "none",
      "--brand",
      BRAND,
      "--yes",
    ]);
    assert.equal(scaffolded.code, 0, scaffolded.stderr);

    // The generated config imports `@assalabs/design-system-tools` as real
    // ESM, and nothing above /var/folders resolves it -- so give the scaffold
    // the `node_modules` entry a real `pnpm install` would have created.
    const theme = join(target, "packages/theme");
    await mkdir(join(theme, "node_modules/@assalabs"), { recursive: true });
    await symlink(
      TOOLS_PACKAGE,
      join(theme, "node_modules/@assalabs/design-system-tools"),
      "dir",
    );

    // The only automated check that a template token file can never reference
    // a primitive the template does not ship: terrazzo hard-errors at
    // `parser:init` on an unresolvable alias.
    const built = await runNode([TOOLS_CLI, "tokens", "build"], theme);
    assert.equal(built.code, 0, built.stderr);
    // css + native + tokenNames + stylex + unistyles: both adapters really ran.
    assert.match(built.stdout, /Built 5 design-system outputs\./);

    const css = await readFile(join(theme, "styles/generated.css"), "utf8");

    // Assert the ALIAS TARGET, not the seed colour. "brand.primary resolves to
    // #123456" passes even when the alias is hardcoded to `.500`, because the
    // ramp always carries the seed hex at whichever step it anchors on.
    assert.ok(
      css.includes(
        `--${PREFIX}-color-brand-primary: var(--${PREFIX}-color-primitive-brand-${BRAND_ANCHOR});`,
      ),
      "brand.primary does not alias the anchored primitive step",
    );
    assert.doesNotMatch(
      css,
      new RegExp(
        `--${PREFIX}-color-brand-primary: var\\(--${PREFIX}-color-primitive-brand-500\\)`,
      ),
    );
    // ... and that the anchor is where the seed actually landed, so the
    // assertion above is about this seed rather than about the number 900.
    assert.ok(
      css.includes(
        `--${PREFIX}-color-primitive-brand-${BRAND_ANCHOR}: ${BRAND};`,
      ),
      "the seed colour is not at the anchor step",
    );

    // The contrast pairs the config asserts really hold for this palette.
    const checked = await runNode([TOOLS_CLI, "tokens", "check"], theme);
    assert.equal(checked.code, 0, checked.stderr);
    assert.match(
      checked.stdout,
      /Tokens and generated outputs are valid and current\./,
    );
  },
);
