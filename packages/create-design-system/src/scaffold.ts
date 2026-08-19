import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
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

  if (options.web && !["stylex", "css-modules", "none"].includes(options.web)) {
    throw new Error("--web must be stylex, css-modules, or none.");
  }

  if (options.native && !["unistyles", "none"].includes(options.native)) {
    throw new Error("--native must be unistyles or none.");
  }
}

export async function scaffoldDesignSystem(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  validateOptions(options);
  const packages = [
    {
      path: "packages/theme",
      files: await renderThemePackage(options),
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

  for (const entry of packages) {
    const targetDirectory = resolve(options.cwd, entry.path);
    try {
      await access(targetDirectory);
      throw new Error(
        `Refusing to overwrite existing directory: ${targetDirectory}`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
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
