/**
 * Scaffold one app template from the *packed* packages and build it for real:
 * pack → install initializer → `init` → point the theme at the packed tools →
 * `pnpm install` → `pnpm build:theme` → the template's own build or typecheck.
 *
 * Usage: node scripts/verify-template.mjs <expo|web-rsbuild|web-vite|none>
 */
import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  installPackedInitializer,
  packPackages,
  repositoryRoot,
  run,
} from "./lib/pack.mjs";

const SCOPE = "@foo";
const PREFIX = "foo";
const BRAND = "#ff3131";

const TEMPLATES = {
  expo: {
    initArgs: ["--template", "expo"],
    shipsWorkspaceRoot: true,
    verify: (target) => run("pnpm", ["typecheck"], target),
  },
  "web-rsbuild": {
    initArgs: ["--template", "web", "--bundler", "rsbuild"],
    shipsWorkspaceRoot: true,
    verify: (target) =>
      run("pnpm", ["--filter", `${SCOPE}/web`, "build"], target),
  },
  "web-vite": {
    initArgs: ["--template", "web", "--bundler", "vite"],
    shipsWorkspaceRoot: true,
    verify: (target) =>
      run("pnpm", ["--filter", `${SCOPE}/web`, "build"], target),
  },
  none: {
    initArgs: ["--template", "none"],
    shipsWorkspaceRoot: false,
    verify: (target) =>
      run("pnpm", ["--filter", `${SCOPE}/theme`, "test"], target),
  },
};

/**
 * Dotfiles the app templates ship dot-less because `npm pack` strips the dotted
 * forms, plus what `render.ts` must restore on write and what proves the file
 * is the real thing rather than an empty placeholder.
 */
const ALIASED_DOTFILES = [
  { shipped: "gitignore", written: ".gitignore", marker: "node_modules" },
  { shipped: "npmrc", written: ".npmrc", marker: "node-linker=hoisted" },
];

const WORKFLOW_FILE = ".github/workflows/theme-check.yml";

function usage() {
  console.error(
    `Usage: node scripts/verify-template.mjs <${Object.keys(TEMPLATES).join("|")}>`,
  );
  process.exit(1);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertPresent(target, filename, marker) {
  const path = join(target, filename);
  if (!(await exists(path))) {
    throw new Error(`Scaffold is missing ${filename}.`);
  }
  if (marker && !(await readFile(path, "utf8")).includes(marker)) {
    throw new Error(`${filename} does not contain "${marker}".`);
  }
}

async function assertAbsent(target, filename, reason) {
  if (await exists(join(target, filename))) {
    throw new Error(`Scaffold wrote ${filename}: ${reason}`);
  }
}

/**
 * The published archive must carry the dot-less names — `npm pack` drops
 * `.gitignore` and `.npmrc` outright, so shipping the dotted forms would
 * publish an initializer that scaffolds a repo without them.
 */
function assertArchiveShipsDotless(createArchive, template) {
  const listing = execFileSync("tar", ["-tf", createArchive], {
    encoding: "utf8",
  });
  const required = [
    `package/template/${template}/${WORKFLOW_FILE}`,
    ...ALIASED_DOTFILES.map(
      ({ shipped }) => `package/template/${template}/${shipped}`,
    ),
  ];

  for (const entry of required) {
    if (!listing.includes(entry)) {
      throw new Error(`Published initializer archive is missing ${entry}.`);
    }
  }

  for (const { written } of ALIASED_DOTFILES) {
    if (listing.includes(`package/template/${template}/${written}`)) {
      throw new Error(
        `template/${template}/${written} must ship dot-less; npm pack strips the dotted name.`,
      );
    }
  }
}

/**
 * `TEMPLATE_FILENAME_ALIASES` is the only thing between the dot-less ship
 * convention and a scaffold that silently loses `node-linker=hoisted`, so
 * assert the written names here rather than trusting the rename.
 */
async function assertScaffoldDotfiles(target, definition) {
  if (!definition.shipsWorkspaceRoot) {
    // `--template none` drops into somebody else's monorepo and must not write
    // workspace-root files at all, aliased or otherwise.
    for (const { shipped, written } of ALIASED_DOTFILES) {
      await assertAbsent(target, shipped, "--template none owns no repo root.");
      await assertAbsent(target, written, "--template none owns no repo root.");
    }
    await assertAbsent(target, ".github", "--template none owns no repo root.");
    return;
  }

  for (const { shipped, written, marker } of ALIASED_DOTFILES) {
    await assertPresent(target, written, marker);
    await assertAbsent(
      target,
      shipped,
      "TEMPLATE_FILENAME_ALIASES did not restore the dotted name.",
    );
  }

  await assertPresent(target, WORKFLOW_FILE, "check:theme");
  await assertAbsent(
    target,
    WORKFLOW_FILE.slice(1),
    "the CI workflow directory lost its leading dot.",
  );
}

async function pointThemeAtPackedTools(target, toolsArchive) {
  const themePackagePath = join(target, "packages/theme/package.json");
  const themePackage = JSON.parse(await readFile(themePackagePath, "utf8"));
  themePackage.devDependencies["@assalabs/design-system-tools"] =
    `file:${toolsArchive}`;
  await writeFile(
    themePackagePath,
    `${JSON.stringify(themePackage, null, 2)}\n`,
  );
}

/**
 * `--template none` ships no workspace root, so stand in for the monorepo it
 * would have been dropped into.
 */
async function writeWorkspaceRoot(target) {
  await writeFile(
    join(target, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        packageManager: "pnpm@10.13.1",
        scripts: { "build:theme": `pnpm --filter ${SCOPE}/theme build` },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(target, "pnpm-workspace.yaml"),
    'packages:\n  - "packages/*"\n',
  );
}

const template = process.argv[2];
if (!template || !Object.hasOwn(TEMPLATES, template)) {
  usage();
}

const definition = TEMPLATES[template];
const target = resolve(repositoryRoot, "examples", template);
const temporaryRoot = await mkdtemp(join(tmpdir(), "assalabs-ds-template-"));

try {
  const archives = await packPackages(temporaryRoot);
  if (definition.shipsWorkspaceRoot) {
    assertArchiveShipsDotless(archives.createArchive, template);
  }
  const initializer = await installPackedInitializer(temporaryRoot, archives);

  await rm(target, { recursive: true, force: true });
  run(
    process.execPath,
    [
      initializer,
      "init",
      "--cwd",
      target,
      "--name",
      "foo",
      "--scope",
      SCOPE,
      "--prefix",
      PREFIX,
      ...definition.initArgs,
      "--brand",
      BRAND,
      "--yes",
    ],
    temporaryRoot,
  );

  await assertScaffoldDotfiles(target, definition);
  await pointThemeAtPackedTools(target, archives.toolsArchive);
  if (!definition.shipsWorkspaceRoot) {
    await writeWorkspaceRoot(target);
  }

  run("pnpm", ["install", "--ignore-scripts"], target);
  run("pnpm", ["build:theme"], target);
  definition.verify(target);

  console.log(`Template ${template} scaffolded, installed and built.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
