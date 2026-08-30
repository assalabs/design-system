import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { generatePalette } from "@assalabs/design-system-tools";
import {
  renderNativePackage,
  renderThemePackage,
  renderWebPackage,
} from "./render.js";
import type { ScaffoldOptions, ScaffoldResult } from "./types.js";

function validateOptions(options: ScaffoldOptions): void {
  if (!options.name.trim()) {
    throw new Error("--name is required.");
  }

  if (!/^@[a-z0-9][a-z0-9._-]*$/.test(options.scope)) {
    throw new Error("--scope must be an npm scope such as @acme.");
  }

  if (!/^[a-z][a-z0-9-]*$/.test(options.prefix)) {
    throw new Error(
      "--prefix must contain lowercase letters, numbers, or hyphens.",
    );
  }

  if (!options.brand) {
    throw new Error("--brand is required.");
  }

  if (options.template && !["expo", "web", "none"].includes(options.template)) {
    throw new Error("--template must be expo, web, or none.");
  }

  if (options.bundler && !["rsbuild", "vite"].includes(options.bundler)) {
    throw new Error("--bundler must be rsbuild or vite.");
  }

  if (options.web && !["stylex", "css-modules", "none"].includes(options.web)) {
    throw new Error("--web must be stylex, css-modules, or none.");
  }

  if (options.native && !["unistyles", "none"].includes(options.native)) {
    throw new Error("--native must be unistyles or none.");
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function scaffoldDesignSystem(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  validateOptions(options);

  // Throws PaletteError on an unusable seed, before anything is written.
  const palette = generatePalette({
    brand: options.brand,
    neutral: options.neutral,
    accent: options.accent,
  });

  const packages = [
    {
      path: "packages/theme",
      files: await renderThemePackage(options, palette),
    },
    {
      path: "packages/ui-web",
      files: await renderWebPackage(options),
    },
    {
      path: "packages/ui-native",
      files: await renderNativePackage(options),
    },
  ].filter(
    (entry): entry is { path: string; files: Map<string, string> } =>
      entry.files !== undefined,
  );

  // App templates own the workspace root, so an existing root manifest means
  // this is somebody else's monorepo and the template would fight it.
  if (options.template && options.template !== "none") {
    const rootManifest = resolve(options.cwd, "package.json");
    if (await exists(rootManifest)) {
      throw new Error(
        `Refusing to overwrite existing file: ${rootManifest}. Use --template none inside an existing monorepo.`,
      );
    }
  }

  for (const entry of packages) {
    const targetDirectory = resolve(options.cwd, entry.path);
    if (await exists(targetDirectory)) {
      throw new Error(
        `Refusing to overwrite existing directory: ${targetDirectory}`,
      );
    }
  }

  const createdDirectories: string[] = [];
  try {
    for (const entry of packages) {
      const targetDirectory = resolve(options.cwd, entry.path);
      await mkdir(dirname(targetDirectory), { recursive: true });
      await mkdir(targetDirectory);
      createdDirectories.push(targetDirectory);
    }

    const filenames: string[] = [];
    for (const entry of packages) {
      const targetDirectory = resolve(options.cwd, entry.path);
      for (const filename of [...entry.files.keys()].sort()) {
        const destination = join(targetDirectory, filename);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, entry.files.get(filename) ?? "", "utf8");
        filenames.push(relative(options.cwd, destination));
      }
    }

    return {
      directory: resolve(options.cwd, "packages/theme"),
      directories: packages.map((entry) => resolve(options.cwd, entry.path)),
      files: filenames.sort(),
    };
  } catch (error) {
    await Promise.all(
      createdDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    throw error;
  }
}
