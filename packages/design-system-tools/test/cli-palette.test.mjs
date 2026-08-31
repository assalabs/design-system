import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
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
import { basename, join, relative, sep } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";

// These tests drive `dist/cli.js` as a real child process, because everything
// under test IS the process contract: exit codes, which stream a message lands
// on, and whether a stack trace is printed. Importing the module would test
// none of that.

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

const TOOLS_PACKAGE = fileURLToPath(new URL("../", import.meta.url));

const EXAMPLE_THEME = fileURLToPath(
  new URL("../../../examples/theme/", import.meta.url),
);

/** The three files `palette` writes, relative to the theme root. */
const PALETTE_FILES = [
  "tokens/primitives/colors.tokens.json",
  "tokens/semantic/light.tokens.json",
  "tokens/semantic/dark.tokens.json",
];

const COPY_SKIPPED = new Set(["node_modules", "dist", ".turbo"]);

const BRAND = "#FF3131";

function runCli(args, cwd) {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolveRun({
          code: error ? (error.code ?? 1) : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

/**
 * A throwaway copy of `examples/theme` the CLI can be pointed at.
 *
 * Two things here are load-bearing, both learned the hard way:
 *
 * 1. `examples/theme/node_modules/@assalabs/design-system-tools` is a RELATIVE
 *    symlink (`../../../../packages/design-system-tools`) into the workspace.
 *    Copying the tree anywhere else leaves it dangling, and every command past
 *    `--json` calls `loadDesignSystemConfig`, which imports the config as real
 *    ESM — and the config imports that specifier. So the copy gets a fresh
 *    ABSOLUTE symlink instead of the copied relative one.
 * 2. `mkdtemp` hands back `/var/folders/...` on macOS, which is a symlink to
 *    `/private/var/folders/...`. `process.cwd()` in the child resolves it, and
 *    the CLI prints refusal paths as `relative(process.cwd(), destination)`.
 *    Resolving the directory here keeps those paths repo-relative rather than
 *    a `../../private/...` climb.
 */
async function createThemeCopy(t) {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "assalabs-ds-cli-palette-")),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  await cp(EXAMPLE_THEME, directory, {
    recursive: true,
    filter: (source) => !COPY_SKIPPED.has(basename(source)),
  });

  await mkdir(join(directory, "node_modules", "@assalabs"), {
    recursive: true,
  });
  await symlink(
    TOOLS_PACKAGE,
    join(directory, "node_modules", "@assalabs", "design-system-tools"),
    "dir",
  );

  return directory;
}

/** Every tracked file in the copy, so "wrote nothing" can be asserted exactly. */
async function snapshotTree(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const files = {};

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const path = relative(directory, join(entry.parentPath, entry.name));

    if (path.split(sep)[0] === "node_modules") {
      continue;
    }

    files[path] = await readFile(join(directory, path), "utf8");
  }

  return files;
}

/**
 * `examples/theme`'s `base.tokens.json` aliases `{color.primitive.blue.600}`,
 * but a generated palette emits `brand/neutral/accent/success/warning/danger/
 * info` — there is no `blue` ramp, so after `--force` that alias is
 * unresolvable and terrazzo hard-errors at `parser:init`. Retarget it the way
 * the scaffolder does: at the ANCHOR step, which is where the seed hex lands,
 * never a hardcoded `.500`.
 */
async function retargetBrandPrimary(directory, anchor) {
  const path = join(directory, "tokens/semantic/base.tokens.json");
  const contents = await readFile(path, "utf8");
  const retargeted = contents.replace(
    "{color.primitive.blue.600}",
    `{color.primitive.brand.${anchor}}`,
  );

  assert.notEqual(
    retargeted,
    contents,
    "example base.tokens.json no longer aliases {color.primitive.blue.600}",
  );
  await writeFile(path, retargeted);
}

test("palette --json prints the palette and writes nothing", async (t) => {
  const directory = await createThemeCopy(t);
  const before = await snapshotTree(directory);

  const result = await runCli(
    ["palette", "--brand", BRAND, "--json"],
    directory,
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");

  const payload = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(payload).sort(), [
    "anchors",
    "primitives",
    "report",
    "semantic",
  ]);
  // `files` is the on-disk rendering. --json is the look-don't-touch mode, so
  // shipping it here would hand callers a payload they could write from.
  assert.equal(payload.files, undefined);
  assert.equal(
    payload.primitives.brand[String(payload.anchors.brand)],
    "#ff3131",
  );
  assert.deepEqual(Object.keys(payload.semantic).sort(), ["dark", "light"]);
  assert.ok(payload.report.length > 0);
  for (const entry of payload.report) {
    assert.ok(entry.ratio >= entry.minimum, `${entry.pair} (${entry.theme})`);
  }

  // Nothing was written: not the palette files, not the generated outputs.
  // (This also proves --json returns BEFORE loadDesignSystemConfig, which is
  // why it is the one palette mode that needs no working config resolution.)
  assert.deepEqual(await snapshotTree(directory), before);
});

test("palette refuses to overwrite a single existing file", async (t) => {
  const directory = await createThemeCopy(t);

  // Leave only the LAST palette file in place. If the refusal ever reported
  // `outputs[0]` instead of what actually exists, it would name colors.tokens.
  await rm(join(directory, "tokens/primitives/colors.tokens.json"));
  await rm(join(directory, "tokens/semantic/light.tokens.json"));

  const result = await runCli(["palette", "--brand", BRAND], directory);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "Refusing to overwrite tokens/semantic/dark.tokens.json (use --force)\n",
  );
});

test("palette refuses with every file it would clobber on one line", async (t) => {
  const directory = await createThemeCopy(t);

  const result = await runCli(["palette", "--brand", BRAND], directory);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  // The whole list, comma-joined, in the CLI's own write order. Naming only the
  // first one (the pre-2.1 behaviour) meant --force then clobbered files the
  // user was never warned about, so the exact shape is the contract.
  assert.equal(
    result.stderr,
    `Refusing to overwrite ${PALETTE_FILES.join(", ")} (use --force)\n`,
  );
  assert.equal(result.stderr.trimEnd().includes("\n"), false);
});

test(
  "palette --force rewrites all three files and the result still builds",
  { timeout: 180_000 },
  async (t) => {
    const directory = await createThemeCopy(t);
    const before = await snapshotTree(directory);

    const inspected = await runCli(
      ["palette", "--brand", BRAND, "--json"],
      directory,
    );
    assert.equal(inspected.code, 0, inspected.stderr);
    const anchor = JSON.parse(inspected.stdout).anchors.brand;

    const forced = await runCli(
      ["palette", "--brand", BRAND, "--force"],
      directory,
    );

    assert.equal(forced.code, 0, forced.stderr);
    assert.equal(forced.stderr, "");
    assert.equal(forced.stdout, "Wrote 3 palette token files.\n");

    const after = await snapshotTree(directory);

    for (const file of PALETTE_FILES) {
      assert.ok(after[file], `${file} is missing`);
      assert.notEqual(after[file], before[file], `${file} was not rewritten`);
      JSON.parse(after[file]);
    }

    // Only those three moved, and the atomic rename left no scratch files.
    assert.deepEqual(
      Object.keys(after)
        .filter((file) => after[file] !== before[file])
        .sort(),
      [...PALETTE_FILES].sort(),
    );
    for (const file of Object.keys(after)) {
      assert.doesNotMatch(file, /\.(tmp|backup)-\d+$/);
    }

    await retargetBrandPrimary(directory, anchor);

    const built = await runCli(["tokens", "build"], directory);
    assert.equal(built.code, 0, built.stderr);
    assert.match(built.stdout, /Built 3 design-system outputs\./);

    const css = await readFile(join(directory, "styles/generated.css"), "utf8");
    assert.ok(
      css.includes(
        `--ds-color-brand-primary: var(--ds-color-primitive-brand-${anchor});`,
      ),
      "brand.primary does not alias the anchored primitive step",
    );
    assert.ok(
      css.includes(`--ds-color-primitive-brand-${anchor}: #ff3131;`),
      "the seed colour is not at the anchor step",
    );

    const checked = await runCli(["tokens", "check"], directory);
    assert.equal(checked.code, 0, checked.stderr);
    assert.match(
      checked.stdout,
      /Tokens and generated outputs are valid and current\./,
    );
  },
);

test("palette rejects a non-hex brand without a stack trace", async (t) => {
  const directory = await createThemeCopy(t);

  const result = await runCli(["palette", "--brand", "red"], directory);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, '--brand must be #RRGGBB (got "red")\n');
  // Curated errors stay one line: no `at ...` frames without --debug.
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test("palette --help works without --brand", async (t) => {
  const directory = await createThemeCopy(t);

  const result = await runCli(["palette", "--help"], directory);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /assalabs-ds palette/);
  assert.match(result.stdout, /--force {2,}Overwrite existing token files\./);
  assert.doesNotMatch(result.stdout, /--brand is required/);
});

test("--debug prints the stack for a propagated error", async (t) => {
  const directory = await createThemeCopy(t);

  // A config that throws while it is being imported. The CLI does not author
  // this message, it only propagates it, which is exactly the case --debug
  // exists for.
  await writeFile(
    join(directory, "broken.config.mjs"),
    "const missing = undefined;\nexport default { name: missing.name };\n",
  );

  const quiet = await runCli(
    ["palette", "--brand", BRAND, "--force", "--config", "broken.config.mjs"],
    directory,
  );

  assert.equal(quiet.code, 1);
  assert.match(quiet.stderr, /Cannot read properties of undefined/);
  assert.doesNotMatch(quiet.stderr, /\n\s+at /);

  const debugged = await runCli(
    [
      "palette",
      "--brand",
      BRAND,
      "--force",
      "--config",
      "broken.config.mjs",
      "--debug",
    ],
    directory,
  );

  assert.equal(debugged.code, 1);
  assert.match(debugged.stderr, /\n\s+at /);
  // The cause chain carries the original error the message was re-wrapped from.
  assert.match(debugged.stderr, /Caused by: TypeError: /);

  // --debug is a reporting flag, not a command word: leading it must not shift
  // the command out from under the parser.
  const leading = await runCli(["--debug", "tokens", "build"], directory);
  assert.equal(leading.code, 0, leading.stderr);
  assert.match(leading.stdout, /Built 3 design-system outputs\./);
});
