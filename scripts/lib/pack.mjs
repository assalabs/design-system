import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function run(command, args, cwd = repositoryRoot) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: "1" },
    stdio: "inherit",
  });
}

export async function packedFile(directory, fragment) {
  const filenames = await readdir(directory);
  const filename = filenames.find(
    (candidate) => candidate.includes(fragment) && candidate.endsWith(".tgz"),
  );
  if (!filename) {
    throw new Error(`Could not find packed ${fragment} package.`);
  }
  return join(directory, filename);
}

/**
 * Pack both published packages into `destination`. `npm pack` needs an absolute
 * package directory: a relative one makes npm treat the argument as a git spec.
 */
export async function packPackages(destination) {
  for (const packageDirectory of [
    "packages/design-system-tools",
    "packages/create-design-system",
  ]) {
    run("npm", [
      "pack",
      resolve(repositoryRoot, packageDirectory),
      "--pack-destination",
      destination,
      "--silent",
    ]);
  }

  return {
    toolsArchive: await packedFile(destination, "design-system-tools"),
    createArchive: await packedFile(destination, "create-design-system"),
  };
}

/**
 * `npm pack` keeps `workspace:*` verbatim, so installing the initializer
 * straight from its tarball fails with EUNSUPPORTEDPROTOCOL. Install an
 * extracted copy whose tools dependency points at the packed tools tarball.
 *
 * Returns the path of the installed `init` binary.
 */
export async function installPackedInitializer(
  temporaryRoot,
  { toolsArchive, createArchive },
) {
  await writeFile(
    join(temporaryRoot, "package.json"),
    `${JSON.stringify({ private: true }, null, 2)}\n`,
  );

  const extractedRoot = join(temporaryRoot, "initializer");
  await mkdir(extractedRoot, { recursive: true });
  run("tar", ["-xf", createArchive, "-C", extractedRoot]);

  const createPackagePath = join(extractedRoot, "package/package.json");
  const createPackage = JSON.parse(await readFile(createPackagePath, "utf8"));
  createPackage.dependencies["@assalabs/design-system-tools"] =
    `file:${toolsArchive}`;
  await writeFile(
    createPackagePath,
    `${JSON.stringify(createPackage, null, 2)}\n`,
  );

  run(
    "npm",
    ["install", "--ignore-scripts", join(extractedRoot, "package")],
    temporaryRoot,
  );

  return join(
    temporaryRoot,
    "node_modules/@assalabs/create-design-system/bin/create-assalabs-design-system.mjs",
  );
}
