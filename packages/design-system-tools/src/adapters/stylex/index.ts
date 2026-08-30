import type { TokenNormalized } from "@terrazzo/parser";
import { toNativeTokenValue } from "../../nativePlugin.js";
import type { DesignSystemConfig, GeneratedOutput } from "../../types.js";
import {
  assertLightDark,
  assertUniqueKey,
  camelKey,
  groupFor,
  HEADER,
  propertyKey,
  sortGroups,
} from "../shared.js";

const ADAPTER = "stylex";

const CONSTANTS = `const DARK = ${JSON.stringify("@media (prefers-color-scheme: dark)")};
const FORCE_DARK = ${JSON.stringify(':root[data-theme="dark"]')};
const FORCE_LIGHT = ${JSON.stringify(':root[data-theme="light"]')};`;

const CSS_IDENTIFIER = /^[A-Za-z][A-Za-z0-9-]*$/;

function formatFontFamily(value: unknown): string {
  const families = Array.isArray(value) ? (value as string[]) : [String(value)];

  return families
    .map((family) =>
      CSS_IDENTIFIER.test(family) ? family : `'${family.replace(/'/g, "\\'")}'`,
    )
    .join(", ");
}

/** CSS-ready string for a resolved token, reusing the native value semantics. */
function toStylexValue(token: TokenNormalized): string {
  if (token.$type === "fontFamily") {
    return formatFontFamily(token.$value);
  }

  const native = toNativeTokenValue(token);

  if (token.$type === "dimension") {
    return `${native}px`;
  }

  if (token.$type === "duration") {
    return `${native}ms`;
  }

  if (token.$type === "cubicBezier" && Array.isArray(native)) {
    return `cubic-bezier(${native.join(", ")})`;
  }

  if (typeof native === "string") {
    return native;
  }

  if (typeof native === "number") {
    return String(native);
  }

  throw new Error(
    `StyleX adapter cannot serialize token "${token.id}" of type "${token.$type}".`,
  );
}

type Variable = {
  key: string;
  light: string;
  dark: string;
  themed: boolean;
};

function renderVariable(variable: Variable): string {
  const key = propertyKey(variable.key);

  if (!variable.themed) {
    return `  ${key}: ${JSON.stringify(variable.light)},`;
  }

  const light = JSON.stringify(variable.light);
  const dark = JSON.stringify(variable.dark);

  return `  ${key}: { default: ${light}, [DARK]: ${dark}, [FORCE_DARK]: ${dark}, [FORCE_LIGHT]: ${light} },`;
}

/**
 * Emits one flat `stylex.defineVars` per token group. Colors always carry the
 * 4-key theme override object; other groups stay plain strings unless the two
 * themes disagree.
 */
export function emitStylex(
  config: DesignSystemConfig,
  resolvedThemes: ReadonlyMap<string, Record<string, TokenNormalized>>,
): GeneratedOutput {
  const output = config.outputs.stylex;

  if (!output) {
    throw new Error("Adapter stylex requires outputs.stylex to be configured.");
  }

  assertLightDark(config, ADAPTER);

  const light = resolvedThemes.get("light");
  const dark = resolvedThemes.get("dark");

  if (!light || !dark) {
    throw new Error(`Adapter ${ADAPTER} requires themes ["light","dark"]`);
  }

  const groups = new Map<string, Variable[]>();
  const takenKeys = new Map<string, Map<string, string>>();
  const ids = [
    ...new Set([...Object.keys(light), ...Object.keys(dark)]),
  ].sort();
  let themed = false;

  for (const id of ids) {
    const route = groupFor(id.split("."));

    if (!route) {
      continue;
    }

    const lightToken = light[id];
    const darkToken = dark[id];
    const lightValue = toStylexValue(
      lightToken ?? (darkToken as TokenNormalized),
    );
    const darkValue = toStylexValue(
      darkToken ?? (lightToken as TokenNormalized),
    );
    const isColor = (lightToken ?? darkToken)?.$type === "color";
    const key = camelKey(route.segments);
    let taken = takenKeys.get(route.group);

    if (!taken) {
      taken = new Map<string, string>();
      takenKeys.set(route.group, taken);
    }

    assertUniqueKey(taken, route.group, key, id);

    const variable: Variable = {
      key,
      light: lightValue,
      dark: darkValue,
      themed: isColor || lightValue !== darkValue,
    };
    themed ||= variable.themed;

    const existing = groups.get(route.group);

    if (existing) {
      existing.push(variable);
    } else {
      groups.set(route.group, [variable]);
    }
  }

  const blocks = sortGroups([...groups.keys()]).map((group) => {
    const variables = groups.get(group) ?? [];

    return `export const ${group} = stylex.defineVars({\n${variables
      .map(renderVariable)
      .join("\n")}\n});`;
  });

  const sections = [
    HEADER.trimEnd(),
    'import * as stylex from "@stylexjs/stylex";',
    ...(themed ? [CONSTANTS] : []),
    ...blocks,
  ];

  return {
    filename: output.file,
    contents: `${sections.join("\n\n")}\n`,
  };
}
