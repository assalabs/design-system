import type { TokenNormalized } from "@terrazzo/parser";
import { toNativeTokenValue } from "../../nativePlugin.js";
import type { DesignSystemConfig, GeneratedOutput } from "../../types.js";
import {
  assertLightDark,
  assertUniqueKey,
  camelKey,
  declaredCssVariable,
  groupFor,
  HEADER,
  propertyKey,
  sortGroups,
} from "../shared.js";

const ADAPTER = "stylex";

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
  value: string;
};

function renderVariable(variable: Variable): string {
  return `  ${propertyKey(variable.key)}: ${JSON.stringify(variable.value)},`;
}

/**
 * Emits one flat `stylex.defineVars` per token group.
 *
 * Theme-dependent tokens (every color, plus anything else whose light and dark
 * values disagree) are emitted as a `var()` reference to the custom property
 * `outputs.css` already declares, rather than as a literal. Everything else —
 * spacing, radius, fonts, motion — stays a literal, since it is the same in
 * both themes.
 *
 * `stylex.defineVars` cannot express the override itself: StyleX 0.19 treats
 * every non-`default` key of a value object as an at-rule, so a selector key
 * such as `:root[data-theme="dark"]` is emitted as a nested rule with no `&`
 * and lowers to a dead *descendant* selector (`[data-theme=dark] :root`), which
 * can never match because `:root` is the same element. Aliasing the stylesheet
 * instead lets its flat `:root` / `[data-theme]` / `prefers-color-scheme`
 * blocks drive all three states: the StyleX variable is declared once on
 * `:root`, and its substituted value is recomputed whenever the theme changes
 * on that same element.
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

    const themed = isColor || lightValue !== darkValue;
    const variable: Variable = {
      key,
      value: themed
        ? `var(${declaredCssVariable(config.prefix, id)})`
        : lightValue,
    };

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
    ...blocks,
  ];

  return {
    filename: output.file,
    contents: `${sections.join("\n\n")}\n`,
  };
}
