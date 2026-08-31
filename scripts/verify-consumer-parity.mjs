/**
 * AC-7.1: an existing consumer theme, upgraded to this working tree's tools
 * build WITHOUT touching its config, must regenerate byte-identical outputs.
 *
 * An existing external consumer's theme package is the reference: its config
 * declares no `outputs.stylex` and no `outputs.unistyles`, so the adapters
 * added by this branch must stay dormant and nothing else may shift a byte.
 *
 * The consumer repository is READ-ONLY here. Everything runs against a copy in
 * a temp directory, and the source files are hashed before and after the run so
 * an accidental write is a hard failure rather than a silent one.
 *
 * Local only (not part of `pnpm check`): it needs a consumer checkout on disk.
 * `CONSUMER_THEME_DIR` is required and points at the theme package to verify.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { packPackages, run } from "./lib/pack.mjs";

/** The outputs declared by the consumer config, relative to the theme root. */
const GENERATED_OUTPUTS = [
  "styles/generated.css",
  "src/generated/themes.ts",
  "src/generated/tokenNames.ts",
];

/** Never copied: build products and installed trees are regenerated in place. */
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".turbo",
  "dist",
  "node_modules",
]);

function fail(message) {
  console.error(`verify-consumer-parity: ${message}`);
  process.exit(1);
}

const configuredThemeDir = process.env.CONSUMER_THEME_DIR;
if (!configuredThemeDir) {
  fail(
    "CONSUMER_THEME_DIR is required. Usage: CONSUMER_THEME_DIR=<path-to-consumer-theme-package> pnpm test:consumer-parity",
  );
}
const themeSource = resolve(configuredThemeDir);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Byte offset of the first difference, for diffs `diff -u` renders as equal. */
function firstDifferingByte(left, right) {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }
  return shared;
}

function unifiedDiff(expectedPath, actualPath) {
  try {
    execFileSync("diff", ["-u", expectedPath, actualPath], {
      encoding: "utf8",
    });
    return "";
  } catch (error) {
    return error.stdout ?? "";
  }
}

if (!existsSync(themeSource)) {
  fail(`theme directory not found: ${themeSource} (set CONSUMER_THEME_DIR)`);
}
if (!existsSync(join(themeSource, "design-system.config.mjs"))) {
  fail(`${themeSource} has no design-system.config.mjs`);
}

const expected = new Map();
for (const output of GENERATED_OUTPUTS) {
  const path = join(themeSource, output);
  if (!existsSync(path)) {
    fail(`${themeSource} has no committed ${output} to compare against`);
  }
  expected.set(output, await readFile(path));
}

/** Guard rail: the consumer checkout must be identical when this exits. */
const sourceFingerprint = new Map();
for (const [output, contents] of expected) {
  sourceFingerprint.set(output, sha256(contents));
}

const temporaryRoot = await mkdtemp(
  join(tmpdir(), "assalabs-consumer-parity-"),
);

try {
  // `npm pack` ships whatever `dist/` holds, so build it here rather than
  // trusting a stale one: a parity result from an old bundle proves nothing.
  run("pnpm", ["--filter", "@assalabs/design-system-tools", "build"]);
  const { toolsArchive } = await packPackages(temporaryRoot);

  const themeCopy = join(temporaryRoot, basename(themeSource));
  await cp(themeSource, themeCopy, {
    recursive: true,
    filter: (source) => !EXCLUDED_DIRECTORIES.has(basename(source)),
  });

  // Tokens and `design-system.config.mjs` are copied verbatim — that is the
  // whole point. Only the toolchain dependency is redirected, at the packed
  // build of this working tree, so the install needs no registry credentials
  // and pulls nothing the parity check does not exercise.
  const packagePath = join(themeCopy, "package.json");
  const themePackage = JSON.parse(await readFile(packagePath, "utf8"));
  const declaredRange =
    themePackage.devDependencies?.["@assalabs/design-system-tools"] ??
    themePackage.dependencies?.["@assalabs/design-system-tools"];
  if (!declaredRange) {
    throw new Error(
      `${themeSource} does not depend on @assalabs/design-system-tools.`,
    );
  }
  themePackage.devDependencies = {
    "@assalabs/design-system-tools": `file:${toolsArchive}`,
  };
  delete themePackage.dependencies?.["@assalabs/design-system-tools"];
  await writeFile(packagePath, `${JSON.stringify(themePackage, null, 2)}\n`);

  run("npm", ["install", "--ignore-scripts"], themeCopy);

  // Delete first: a tool that silently wrote nothing would otherwise "pass"
  // against the files it was supposed to reproduce.
  for (const output of GENERATED_OUTPUTS) {
    await rm(join(themeCopy, output), { force: true });
  }

  const cli = join(
    themeCopy,
    "node_modules/@assalabs/design-system-tools/bin/assalabs-ds.mjs",
  );
  run(process.execPath, [cli, "tokens", "build"], themeCopy);
  run(process.execPath, [cli, "tokens", "check"], themeCopy);

  const differences = [];
  for (const output of GENERATED_OUTPUTS) {
    const actualPath = join(themeCopy, output);
    if (!existsSync(actualPath)) {
      differences.push(`${output}: not regenerated`);
      continue;
    }

    const actual = await readFile(actualPath);
    const reference = expected.get(output);
    if (actual.equals(reference)) {
      continue;
    }

    const offset = firstDifferingByte(reference, actual);
    differences.push(
      [
        `${output}: NOT byte-identical`,
        `  committed: ${reference.length} bytes, sha256 ${sha256(reference)}`,
        `  generated: ${actual.length} bytes, sha256 ${sha256(actual)}`,
        `  first difference at byte ${offset}`,
        unifiedDiff(join(themeSource, output), actualPath),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  for (const [output, fingerprint] of sourceFingerprint) {
    const current = sha256(await readFile(join(themeSource, output)));
    if (current !== fingerprint) {
      differences.push(
        `${output}: the source checkout at ${themeSource} was MODIFIED by this run`,
      );
    }
  }

  if (differences.length > 0) {
    console.error(
      `verify-consumer-parity: ${themeSource} does not regenerate byte-identical outputs with the packed tools build.\n`,
    );
    for (const difference of differences) {
      console.error(difference);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Byte-identical: ${GENERATED_OUTPUTS.join(", ")} regenerated from ${themeSource} (declared ${declaredRange}) with the packed tools build.`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
