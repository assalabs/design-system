import { existsSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";
import { assertNativeThemeNames } from "./nativePlugin.js";
import type { DesignSystemConfig, LoadedDesignSystemConfig } from "./types.js";

export const DEFAULT_CONFIG_FILENAME = "design-system.config.mjs";

// Same containment rule as assertOutputPath in build.ts, reported at config time
// so adapter paths fail on load instead of on the first write.
function assertContainedOutput(label: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`Output ${label} cannot be empty.`);
  }

  const normalized = normalize(value);

  if (
    isAbsolute(value) ||
    normalized === ".." ||
    normalized.startsWith(`..${sep}`)
  ) {
    throw new Error(`Output path must stay inside the theme package: ${value}`);
  }
}

export function defineDesignSystem(
  config: DesignSystemConfig,
): DesignSystemConfig {
  if (!config.name.trim()) {
    throw new Error("Design system name cannot be empty.");
  }

  if (!/^[a-z][a-z0-9-]*$/.test(config.prefix)) {
    throw new Error(
      "Design system prefix must start with a letter and contain only lowercase letters, numbers, and hyphens.",
    );
  }

  if (config.themes.length === 0) {
    throw new Error("At least one theme is required.");
  }

  if (!config.themes.includes(config.defaultTheme)) {
    throw new Error(
      `Default theme "${config.defaultTheme}" is not present in themes.`,
    );
  }

  if (config.outputs.native) {
    assertNativeThemeNames(config.themes);
  }

  if (!config.outputs.css && !config.outputs.native) {
    throw new Error("At least one CSS or native output is required.");
  }

  if (config.outputs.stylex) {
    assertContainedOutput("stylex.file", config.outputs.stylex.file);

    if (!config.outputs.css) {
      throw new Error(
        "outputs.stylex requires outputs.css because the generated StyleX variables reference the stylesheet's custom properties.",
      );
    }
  }

  if (config.outputs.unistyles) {
    const { dir } = config.outputs.unistyles;
    assertContainedOutput("unistyles.dir", dir);

    if (!config.outputs.native) {
      throw new Error(
        "outputs.unistyles requires outputs.native because the generated Unistyles module imports the native themes file.",
      );
    }

    const themesDirectory = relative(
      resolve(sep, dir),
      resolve(sep, dirname(config.outputs.native)),
    );

    if (themesDirectory.startsWith("..") || isAbsolute(themesDirectory)) {
      throw new Error(
        `outputs.unistyles.dir "${dir}" must contain outputs.native "${config.outputs.native}" so the generated Unistyles module can import the themes file.`,
      );
    }
  }

  return Object.freeze({ ...config });
}

export async function loadDesignSystemConfig(
  configArgument = DEFAULT_CONFIG_FILENAME,
  workingDirectory = process.cwd(),
): Promise<LoadedDesignSystemConfig> {
  const configPath = resolve(workingDirectory, configArgument);

  if (!existsSync(configPath)) {
    throw new Error(`Design system config was not found at ${configPath}.`);
  }

  const moduleUrl = `${pathToFileURL(configPath).href}?updated=${Date.now()}`;
  const loaded = (await import(moduleUrl)) as { default?: DesignSystemConfig };

  if (!loaded.default) {
    throw new Error(`No default export was found in ${configPath}.`);
  }

  return {
    config: defineDesignSystem(loaded.default),
    configPath,
    rootDirectory: dirname(configPath),
  };
}
