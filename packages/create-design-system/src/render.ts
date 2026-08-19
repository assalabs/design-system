import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import toolsPackage from "../../design-system-tools/package.json" with { type: "json" };
import type { ScaffoldOptions } from "./types.js";

const templateDirectory = fileURLToPath(
  new URL("../template/theme/", import.meta.url),
);

function currentToolsVersion(): string {
  if (typeof toolsPackage.version !== "string" || !toolsPackage.version) {
    throw new Error("Could not resolve the design-system-tools version.");
  }

  return toolsPackage.version;
}

async function readTemplateFiles(
  directory: string,
  rootDirectory = directory,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await readTemplateFiles(absolutePath, rootDirectory);
      for (const [filename, contents] of nested) {
        files.set(filename, contents);
      }
    } else {
      files.set(
        relative(rootDirectory, absolutePath),
        await readFile(absolutePath, "utf8"),
      );
    }
  }

  return files;
}

function replacePlaceholders(
  files: Map<string, string>,
  options: ScaffoldOptions,
): Map<string, string> {
  const replacements = new Map([
    ["{{DESIGN_SYSTEM_NAME}}", options.name],
    ["{{PACKAGE_SCOPE}}", options.scope],
    ["{{PACKAGE_NAME}}", `${options.scope}/theme`],
    ["{{PREFIX}}", options.prefix],
  ]);

  return new Map(
    [...files].map(([filename, source]) => {
      let contents = source;
      for (const [placeholder, value] of replacements) {
        contents = contents.split(placeholder).join(value);
      }
      return [filename, contents];
    }),
  );
}

async function renderAdapterPackage(
  relativeDirectory: string,
  options: ScaffoldOptions,
): Promise<Map<string, string>> {
  const directory = fileURLToPath(
    new URL(`../template/${relativeDirectory}/`, import.meta.url),
  );
  return replacePlaceholders(
    await readTemplateFiles(directory, directory),
    options,
  );
}

function packageJson(options: ScaffoldOptions, toolsVersion: string): string {
  const usesStyleX = options.web === "stylex";
  return `${JSON.stringify(
    {
      name: `${options.scope}/theme`,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      style: "./styles/generated.css",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
        "./native": {
          types: "./dist/native.d.ts",
          import: "./dist/native.js",
        },
        "./css": "./styles/generated.css",
        ...(usesStyleX
          ? { "./tokens.stylex.ts": "./src/generated/tokens.stylex.ts" }
          : {}),
      },
      sideEffects: ["./styles/generated.css"],
      scripts: {
        build:
          "assalabs-ds tokens build && tsup src/index.ts src/native.ts --format esm --dts --clean",
        dev: 'concurrently --kill-others-on-fail "assalabs-ds tokens watch" "tsup src/index.ts src/native.ts --format esm --dts --watch"',
        lint: "eslint .",
        test: "assalabs-ds tokens check",
        "tokens:build": "assalabs-ds tokens build",
        "tokens:check": "assalabs-ds tokens check",
        typecheck: "tsc --noEmit",
      },
      devDependencies: {
        "@assalabs/design-system-tools": `^${toolsVersion}`,
        "@tsconfig/recommended": "^1.0.8",
        "@eslint/js": "^9.0.0",
        concurrently: "^9.2.1",
        eslint: "^9.0.0",
        tsup: "^8.5.1",
        typescript: "^6.0.0",
        "typescript-eslint": "^8.0.0",
        ...(usesStyleX ? { "@stylexjs/stylex": "^0.19.0" } : {}),
      },
    },
    null,
    2,
  )}\n`;
}

function configFile(options: ScaffoldOptions): string {
  return `import { defineDesignSystem } from "@assalabs/design-system-tools";

export default defineDesignSystem({
  name: ${JSON.stringify(options.name)},
  prefix: ${JSON.stringify(options.prefix)},
  source: "./tokens/theme.resolver.json",
  themes: ["light", "dark"],
  defaultTheme: "light",
  outputs: {
    css: "styles/generated.css",
    native: "src/generated/themes.ts",
    tokenNames: "src/generated/tokenNames.ts",
  },
  requiredTokens: [
    "color.surface.canvas",
    "color.surface.card",
    "color.text.primary",
    "color.text.secondary",
    "color.border.default",
    "color.action.primary.background",
    "color.action.primary.foreground",
    "color.focus.ring",
    "dimension.space.4",
    "dimension.radius.md",
    "font.family.sans",
    "motion.duration.normal",
  ],
  contrastPairs: [
    {
      foreground: "color.text.primary",
      background: "color.surface.canvas",
      minimum: 4.5,
      description: "primary text",
    },
    {
      foreground: "color.text.secondary",
      background: "color.surface.canvas",
      minimum: 4.5,
      description: "secondary text",
    },
    {
      foreground: "color.action.primary.foreground",
      background: "color.action.primary.background",
      minimum: 3,
      description: "primary control",
    },
    {
      foreground: "color.focus.ring",
      background: "color.surface.canvas",
      minimum: 3,
      description: "focus indicator",
    },
  ],
});
`;
}

export async function renderThemePackage(
  options: ScaffoldOptions,
): Promise<Map<string, string>> {
  const toolsVersion = currentToolsVersion();
  const files = replacePlaceholders(
    await readTemplateFiles(templateDirectory, templateDirectory),
    options,
  );
  files.set("package.json", packageJson(options, toolsVersion));
  files.set("design-system.config.mjs", configFile(options));
  files.set(
    "src/index.ts",
    'export { tokenNames, type TokenName } from "./generated/tokenNames";\nexport { darkTheme, lightTheme, themes, type Theme, type ThemeName } from "./generated/themes";\n',
  );
  files.set(
    "src/native.ts",
    'export { darkTheme, lightTheme, themes, type Theme, type ThemeName } from "./generated/themes";\n',
  );

  if (options.web === "stylex") {
    files.set(
      "src/generated/tokens.stylex.ts",
      `import * as stylex from "@stylexjs/stylex";\n\n// Typed StyleX references to the generated DTCG custom properties.\nexport const tokens = stylex.defineVars({\n  colorActionPrimaryBackground: "var(--${options.prefix}-color-action-primary-background)",\n  colorActionPrimaryForeground: "var(--${options.prefix}-color-action-primary-foreground)",\n  colorActionPrimaryPressed: "var(--${options.prefix}-color-action-primary-pressed)",\n  colorBorderDefault: "var(--${options.prefix}-color-border-default)",\n  colorFeedbackErrorForeground: "var(--${options.prefix}-color-feedback-error-foreground)",\n  colorFocusRing: "var(--${options.prefix}-color-focus-ring)",\n  colorSurfaceCanvas: "var(--${options.prefix}-color-surface-canvas)",\n  colorSurfaceCard: "var(--${options.prefix}-color-surface-card)",\n  colorTextPrimary: "var(--${options.prefix}-color-text-primary)",\n  colorTextSecondary: "var(--${options.prefix}-color-text-secondary)",\n  dimensionRadiusMd: "var(--${options.prefix}-dimension-radius-md)",\n  dimensionRadiusPill: "var(--${options.prefix}-dimension-radius-pill)",\n  dimensionSpace1: "var(--${options.prefix}-dimension-space-1)",\n  dimensionSpace2: "var(--${options.prefix}-dimension-space-2)",\n  dimensionSpace3: "var(--${options.prefix}-dimension-space-3)",\n  dimensionSpace4: "var(--${options.prefix}-dimension-space-4)",\n  dimensionSpace6: "var(--${options.prefix}-dimension-space-6)",\n  fontFamilySans: "var(--${options.prefix}-font-family-sans)",\n  fontSizeMd: "var(--${options.prefix}-font-size-md)",\n  fontSizeSm: "var(--${options.prefix}-font-size-sm)",\n  fontWeightSemibold: "var(--${options.prefix}-font-weight-semibold)",\n  motionDurationFast: "var(--${options.prefix}-motion-duration-fast)",\n});\n`,
    );
  }

  return files;
}

export async function renderWebPackage(
  options: ScaffoldOptions,
): Promise<Map<string, string> | undefined> {
  if (!options.web || options.web === "none") {
    return undefined;
  }
  return renderAdapterPackage(`ui-web/${options.web}`, options);
}

export async function renderNativePackage(
  options: ScaffoldOptions,
): Promise<Map<string, string> | undefined> {
  if (!options.native || options.native === "none") {
    return undefined;
  }
  return renderAdapterPackage(`ui-native/${options.native}`, options);
}
