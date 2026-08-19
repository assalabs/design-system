import type { Plugin, TokenNormalized } from "@terrazzo/parser";

export type NativeThemePluginOptions = {
  filename: string;
  tokenNamesFilename?: string;
  themes: readonly string[];
  themeModifier: string;
};

type DtcgColor = {
  colorSpace: string;
  components: Array<number | "none">;
  alpha?: number;
};

type DtcgDimension = {
  value: number;
  unit: string;
};

function byteToHex(value: number): string {
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function serializeColor(value: DtcgColor, tokenId: string): string {
  if (value.colorSpace !== "srgb") {
    throw new Error(
      `Native output currently supports srgb colors only; ${tokenId} uses ${value.colorSpace}.`,
    );
  }

  if (value.components.some((component) => component === "none")) {
    throw new Error(
      `Native output cannot serialize a none component in ${tokenId}.`,
    );
  }

  const [red, green, blue] = value.components as number[];
  const alpha = value.alpha ?? 1;
  const alphaHex = alpha < 1 ? byteToHex(alpha) : "";

  return `#${byteToHex(red)}${byteToHex(green)}${byteToHex(blue)}${alphaHex}`;
}

function serializeDimension(value: DtcgDimension, tokenId: string): number {
  if (value.unit !== "px") {
    throw new Error(
      `Native output currently supports px dimensions only; ${tokenId} uses ${value.unit}.`,
    );
  }

  return value.value;
}

function serializeDuration(value: DtcgDimension): number {
  return value.unit === "s" ? value.value * 1000 : value.value;
}

function serializeNestedValue(value: unknown, tokenId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => serializeNestedValue(item, tokenId));
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;

    if (
      typeof objectValue.colorSpace === "string" &&
      Array.isArray(objectValue.components)
    ) {
      return serializeColor(objectValue as DtcgColor, tokenId);
    }

    if (
      typeof objectValue.value === "number" &&
      typeof objectValue.unit === "string"
    ) {
      return objectValue.unit === "ms" || objectValue.unit === "s"
        ? serializeDuration(objectValue as DtcgDimension)
        : serializeDimension(objectValue as DtcgDimension, tokenId);
    }

    return Object.fromEntries(
      Object.entries(objectValue).map(([key, item]) => [
        key,
        serializeNestedValue(item, tokenId),
      ]),
    );
  }

  return value;
}

export function toNativeTokenValue(token: TokenNormalized): unknown {
  if (token.$type === "color") {
    return serializeColor(token.$value as DtcgColor, token.id);
  }

  if (token.$type === "dimension") {
    return serializeDimension(token.$value as DtcgDimension, token.id);
  }

  if (token.$type === "duration") {
    return serializeDuration(token.$value as DtcgDimension);
  }

  if (token.$type === "fontFamily" && Array.isArray(token.$value)) {
    return token.$value[0];
  }

  return serializeNestedValue(token.$value, token.id);
}

const TYPESCRIPT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function assertNativeThemeNames(themes: readonly string[]): void {
  const seen = new Set<string>();

  for (const theme of themes) {
    if (!TYPESCRIPT_IDENTIFIER.test(theme)) {
      throw new Error(
        `Native theme name "${theme}" must be a valid TypeScript identifier.`,
      );
    }
    if (seen.has(theme)) {
      throw new Error(`Native theme name "${theme}" is duplicated.`);
    }
    seen.add(theme);
  }
}

function propertyName(segment: string): string {
  return segment.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function registerNormalizedPaths(
  path: string[],
  normalizedPaths: Map<string, string>,
): void {
  for (let index = 1; index <= path.length; index += 1) {
    const rawPath = path.slice(0, index).join(".");
    const normalizedPath = path.slice(0, index).map(propertyName).join(".");
    const existingPath = normalizedPaths.get(normalizedPath);

    if (existingPath && existingPath !== rawPath) {
      throw new Error(
        `Native token path collision: "${existingPath}" and "${rawPath}" both normalize to "${normalizedPath}".`,
      );
    }
    normalizedPaths.set(normalizedPath, rawPath);
  }
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
  tokenId: string,
): void {
  let current = target;

  for (const rawSegment of path.slice(0, -1)) {
    const segment = propertyName(rawSegment);
    const child = current[segment];

    if (child === undefined) {
      current[segment] = {};
    } else if (
      typeof child !== "object" ||
      child === null ||
      Array.isArray(child)
    ) {
      throw new Error(
        `Native token path collision at "${path.join(".")}" while writing "${tokenId}".`,
      );
    }
    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = path[path.length - 1];
  const finalSegment = lastSegment ? propertyName(lastSegment) : undefined;
  if (finalSegment) {
    if (Object.prototype.hasOwnProperty.call(current, finalSegment)) {
      throw new Error(
        `Native token path collision at "${path.join(".")}" while writing "${tokenId}".`,
      );
    }
    current[finalSegment] = value;
  }
}

function serializeTheme(tokens: Record<string, TokenNormalized>): string {
  const theme: Record<string, unknown> = {};
  const normalizedPaths = new Map<string, string>();

  for (const id of Object.keys(tokens).sort()) {
    const path = id.split(".");
    registerNormalizedPaths(path, normalizedPaths);
    setNestedValue(theme, path, toNativeTokenValue(tokens[id]), id);
  }

  return JSON.stringify(theme, null, 2);
}

const GENERATED_HEADER =
  "// Generated by @assalabs/design-system-tools. DO NOT EDIT.\n";

export function nativeThemePlugin(options: NativeThemePluginOptions): Plugin {
  assertNativeThemeNames(options.themes);

  return {
    name: "@assalabs/design-system-tools/native",
    build({ resolver, outputFile }) {
      const themeEntries = options.themes.map((theme) => {
        const tokens = resolver.apply({ [options.themeModifier]: theme });
        return { theme, tokens };
      });

      const declarations = themeEntries
        .map(
          ({ theme, tokens }) =>
            `export const ${theme}Theme = ${serializeTheme(tokens)} as const;`,
        )
        .join("\n\n");

      const themeMap = themeEntries
        .map(({ theme }) => `  ${JSON.stringify(theme)}: ${theme}Theme,`)
        .join("\n");

      outputFile(
        options.filename,
        `${GENERATED_HEADER}${declarations}\n\nexport const themes = {\n${themeMap}\n} as const;\n\nexport type ThemeName = keyof typeof themes;\nexport type Theme = (typeof themes)[ThemeName];\n`,
      );

      if (options.tokenNamesFilename) {
        const tokenNames = Object.keys(themeEntries[0]?.tokens ?? {}).sort();
        outputFile(
          options.tokenNamesFilename,
          `${GENERATED_HEADER}export const tokenNames = ${JSON.stringify(tokenNames, null, 2)} as const;\n\nexport type TokenName = (typeof tokenNames)[number];\n`,
        );
      }
    },
  };
}
