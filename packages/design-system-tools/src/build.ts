import { readFile, rename, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  build as terrazzoBuild,
  defineConfig as defineTerrazzoConfig,
  parse,
  type TokenNormalized,
} from "@terrazzo/parser";
import css from "@terrazzo/plugin-css";
import { nativeThemePlugin } from "./nativePlugin.js";
import type { GeneratedOutput, LoadedDesignSystemConfig } from "./types.js";
import { validateResolvedThemes } from "./validation.js";

function directoryUrl(directory: string): URL {
  return pathToFileURL(`${resolve(directory)}${sep}`);
}

function cssWrapper(selector: string, scheme?: string) {
  return (contents: string): string => {
    const colorScheme = scheme ? `  color-scheme: ${scheme};\n` : "";
    return `${selector} {\n${colorScheme}  ${contents}\n}`;
  };
}

function cssMediaWrapper(query: string, selector: string, scheme?: string) {
  return (contents: string): string => {
    const colorScheme = scheme ? `    color-scheme: ${scheme};\n` : "";
    return `${query} {\n  ${selector} {\n${colorScheme}    ${contents}\n  }\n}`;
  };
}

function cssPermutations(
  themes: readonly string[],
  defaultTheme: string,
  themeModifier: string,
) {
  const permutations = [
    {
      input: { [themeModifier]: defaultTheme },
      prepare: cssWrapper(":root", "light dark"),
    },
  ];

  for (const theme of themes) {
    permutations.push({
      input: { [themeModifier]: theme },
      prepare: cssWrapper(
        `[data-theme=${JSON.stringify(theme)}]`,
        theme === "light" || theme === "dark" ? theme : undefined,
      ),
    });
  }

  if (themes.includes("dark") && defaultTheme !== "dark") {
    permutations.push({
      input: { [themeModifier]: "dark" },
      prepare: cssMediaWrapper(
        "@media (prefers-color-scheme: dark)",
        ":root:not([data-theme])",
        "dark",
      ),
    });
  }

  return permutations;
}

function assertOutputPath(rootDirectory: string, filename: string): string {
  const outputPath = resolve(rootDirectory, filename);
  const relativePath = relative(rootDirectory, outputPath);

  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error(
      `Output path must stay inside the theme package: ${filename}`,
    );
  }

  return outputPath;
}

export async function generateDesignSystem(
  loaded: LoadedDesignSystemConfig,
): Promise<GeneratedOutput[]> {
  const { config, rootDirectory } = loaded;
  const themeModifier = config.themeModifier ?? "theme";
  const plugins = [];

  if (config.outputs.css) {
    plugins.push(
      css({
        filename: config.outputs.css,
        legacyHex: true,
        variableName: (token) =>
          `--${config.prefix}-${token.id.split(".").join("-")}`,
        permutations: cssPermutations(
          config.themes,
          config.defaultTheme,
          themeModifier,
        ),
      }),
    );
  }

  if (config.outputs.native) {
    plugins.push(
      nativeThemePlugin({
        filename: config.outputs.native,
        tokenNamesFilename: config.outputs.tokenNames,
        themes: config.themes,
        themeModifier,
      }),
    );
  }

  const terrazzoConfig = defineTerrazzoConfig(
    {
      tokens: config.source,
      outDir: ".",
      plugins,
    },
    { cwd: directoryUrl(rootDirectory) },
  );
  const sourceUrl = new URL(config.source, directoryUrl(rootDirectory));
  const source = await readFile(sourceUrl, "utf8");
  const parsed = await parse(
    { filename: sourceUrl, src: source },
    {
      config: terrazzoConfig,
    },
  );
  const resolvedThemes = new Map<string, Record<string, TokenNormalized>>();

  for (const theme of config.themes) {
    resolvedThemes.set(
      theme,
      parsed.resolver.apply({ [themeModifier]: theme }),
    );
  }

  validateResolvedThemes(config, resolvedThemes);

  const result = await terrazzoBuild(parsed.tokens, {
    config: terrazzoConfig,
    resolver: parsed.resolver,
    sources: parsed.sources,
  });

  return result.outputFiles.map(({ filename, contents }) => ({
    filename,
    contents,
  }));
}

export async function writeGeneratedOutputs(
  loaded: LoadedDesignSystemConfig,
  outputs: GeneratedOutput[],
): Promise<void> {
  for (const output of outputs) {
    const destination = assertOutputPath(loaded.rootDirectory, output.filename);
    const temporary = `${destination}.tmp-${process.pid}`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(temporary, output.contents);

    try {
      await rename(temporary, destination);
      continue;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !["EACCES", "EEXIST", "EPERM"].includes(code)) {
        await rm(temporary, { force: true });
        throw error;
      }
    }

    const displaced = `${destination}.backup-${process.pid}`;
    await rename(destination, displaced);
    try {
      await rename(temporary, destination);
      await rm(displaced, { force: true });
    } catch (error) {
      await rm(destination, { force: true });
      await rename(displaced, destination);
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

export async function findStaleOutputs(
  loaded: LoadedDesignSystemConfig,
  outputs: GeneratedOutput[],
): Promise<string[]> {
  const stale: string[] = [];

  for (const output of outputs) {
    const destination = assertOutputPath(loaded.rootDirectory, output.filename);
    let current: Buffer | undefined;

    try {
      current = await readFile(destination);
    } catch {
      stale.push(output.filename);
      continue;
    }

    const next = Buffer.isBuffer(output.contents)
      ? output.contents
      : Buffer.from(output.contents);
    if (!current.equals(next)) {
      stale.push(output.filename);
    }
  }

  return stale;
}
