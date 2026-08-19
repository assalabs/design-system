import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DesignSystemConfig, LoadedDesignSystemConfig } from "./types.js";

export const DEFAULT_CONFIG_FILENAME = "design-system.config.mjs";

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

  if (!config.outputs.css && !config.outputs.native) {
    throw new Error("At least one CSS or native output is required.");
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
