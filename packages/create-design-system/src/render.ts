import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCAFFOLD_CONTRAST_PAIRS,
  type PaletteResult,
} from "@assalabs/design-system-tools";
import toolsPackage from "../../design-system-tools/package.json" with { type: "json" };
import type { ScaffoldOptions } from "./types.js";
import { resolveThemeWiring, type ThemeWiring } from "./wiring.js";

const templateDirectory = fileURLToPath(
  new URL("../template/theme/", import.meta.url),
);

/**
 * Placeholder the template ships instead of a step number, so a scaffold that
 * ever skipped the anchor retarget fails loudly at `tokens build` with an
 * unresolved alias rather than silently aliasing the wrong swatch.
 */
const BRAND_ANCHOR_PLACEHOLDER = "{color.primitive.brand.ANCHOR}";

const BASE_TOKENS_FILE = "tokens/semantic/base.tokens.json";

function currentToolsVersion(): string {
  if (typeof toolsPackage.version !== "string" || !toolsPackage.version) {
    throw new Error("Could not resolve the design-system-tools version.");
  }

  return toolsPackage.version;
}

function appName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "app"
  );
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
    ["{{scope}}", options.scope],
    ["{{prefix}}", options.prefix],
    ["{{TOOLS_VERSION}}", currentToolsVersion()],
    ["{{APP_NAME}}", appName(options.name)],
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

/**
 * Point `color.brand.primary` at the step the generated brand ramp actually
 * anchors the seed on. Hardcoding `.500` is wrong for any seed that is not
 * mid-lightness: `#123456` anchors at 900 and `#fff5f5` at 50, and nothing
 * downstream catches it (`color.brand.primary` is in no `requiredTokens` and no
 * `contrastPairs`), so the mistake would ship as a silently wrong brand colour.
 */
function retargetBrandPrimary(source: string, anchor: number): string {
  if (!source.includes(BRAND_ANCHOR_PLACEHOLDER)) {
    throw new Error(
      `${BASE_TOKENS_FILE} is missing "${BRAND_ANCHOR_PLACEHOLDER}"; the brand anchor cannot be retargeted.`,
    );
  }

  return source
    .split(BRAND_ANCHOR_PLACEHOLDER)
    .join(`{color.primitive.brand.${anchor}}`);
}

function packageJson(
  options: ScaffoldOptions,
  wiring: ThemeWiring,
  toolsVersion: string,
): string {
  return `${JSON.stringify(
    {
      name: `${options.scope}/theme`,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      style: "./styles/generated.css",
      exports: wiring.exports,
      sideEffects: ["./styles/generated.css"],
      scripts: {
        build: `assalabs-ds tokens build && tsup ${wiring.tsupEntries.join(" ")} --format esm --dts --clean`,
        dev: `concurrently --kill-others-on-fail "assalabs-ds tokens watch" "tsup ${wiring.tsupEntries.join(" ")} --format esm --dts --watch"`,
        lint: "eslint .",
        test: "assalabs-ds tokens check",
        "tokens:build": "assalabs-ds tokens build",
        "tokens:check": "assalabs-ds tokens check",
        typecheck: "pnpm tokens:build && tsc --noEmit",
      },
      ...(Object.keys(wiring.peerDependencies).length > 0
        ? {
            peerDependencies: wiring.peerDependencies,
            peerDependenciesMeta: wiring.peerDependenciesMeta,
          }
        : {}),
      devDependencies: {
        "@assalabs/design-system-tools": `^${toolsVersion}`,
        "@tsconfig/recommended": "^1.0.8",
        "@eslint/js": "^9.0.0",
        concurrently: "^9.2.1",
        eslint: "^9.0.0",
        tsup: "^8.5.1",
        typescript: "^6.0.0",
        "typescript-eslint": "^8.0.0",
        ...wiring.devDependencies,
      },
    },
    null,
    2,
  )}\n`;
}

function configFile(options: ScaffoldOptions, wiring: ThemeWiring): string {
  const outputs = [
    `    css: "styles/generated.css",`,
    `    native: "src/generated/themes.ts",`,
    `    tokenNames: "src/generated/tokenNames.ts",`,
    ...(wiring.outputs.stylex
      ? [`    stylex: { file: ${JSON.stringify(wiring.outputs.stylex.file)} },`]
      : []),
    ...(wiring.outputs.unistyles
      ? [
          `    unistyles: { dir: ${JSON.stringify(wiring.outputs.unistyles.dir)} },`,
        ]
      : []),
  ].join("\n");

  // The palette generator guarantees these ratios for every generated theme, so
  // `tokens check` re-asserts exactly what `generatePalette` promised.
  const contrastPairs = SCAFFOLD_CONTRAST_PAIRS.map(
    (pair) =>
      `    {
      foreground: "color.${pair.fg}",
      background: "color.${pair.bg}",
      minimum: ${pair.minimum},
      description: ${JSON.stringify(`${pair.fg} on ${pair.bg}`)},
    },`,
  ).join("\n");

  return `import { defineDesignSystem } from "@assalabs/design-system-tools";

export default defineDesignSystem({
  name: ${JSON.stringify(options.name)},
  prefix: ${JSON.stringify(options.prefix)},
  source: "./tokens/theme.resolver.json",
  themes: ["light", "dark"],
  defaultTheme: "light",
  outputs: {
${outputs}
  },
  requiredTokens: [
    "color.bg.canvas",
    "color.bg.surface",
    "color.fg.default",
    "color.fg.muted",
    "color.border.default",
    "color.brand.default",
    "color.brand.primary",
    "color.fg.onBrand",
    "dimension.space.4",
    "dimension.radius.md",
    "font.family.sans",
    "motion.duration.normal",
  ],
  contrastPairs: [
${contrastPairs}
  ],
});
`;
}

export async function renderThemePackage(
  options: ScaffoldOptions,
  palette: PaletteResult,
): Promise<Map<string, string>> {
  const toolsVersion = currentToolsVersion();
  const wiring = resolveThemeWiring(options);
  const files = replacePlaceholders(
    await readTemplateFiles(templateDirectory, templateDirectory),
    options,
  );

  files.set(
    BASE_TOKENS_FILE,
    retargetBrandPrimary(
      files.get(BASE_TOKENS_FILE) ?? "",
      palette.anchors.brand,
    ),
  );

  for (const [filename, contents] of Object.entries(palette.files)) {
    files.set(`tokens/${filename}`, contents);
  }

  files.set("package.json", packageJson(options, wiring, toolsVersion));
  files.set("design-system.config.mjs", configFile(options, wiring));
  files.set(
    "src/index.ts",
    'export { tokenNames, type TokenName } from "./generated/tokenNames";\nexport { darkTheme, lightTheme, themes, type Theme, type ThemeName } from "./generated/themes";\n',
  );
  files.set(
    "src/native.ts",
    'export { darkTheme, lightTheme, themes, type Theme, type ThemeName } from "./generated/themes";\n',
  );

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
