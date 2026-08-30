import { STEPS, type Ramp } from "./ladder.js";
import type { RampName, RoleId, TokenRef } from "./semantic.js";

/** Emission order for primitive ramps (design: brand, neutral, accent, status). */
export const RAMP_ORDER: readonly RampName[] = [
  "brand",
  "neutral",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
];

/**
 * Canonical semantic key order (the design role table). `emit.ts` owns key
 * order on purpose: `selectRoles` resolves bg roles first and the brand/onBrand
 * pair last, so its insertion order is stable but not the documented order.
 */
export const ROLE_ORDER: readonly RoleId[] = [
  "bg.canvas",
  "bg.surface",
  "bg.subtle",
  "fg.default",
  "fg.muted",
  "fg.onBrand",
  "border.default",
  "border.strong",
  "brand.default",
  "brand.hover",
  "brand.active",
  "accent.default",
  "status.success",
  "status.warning",
  "status.danger",
  "status.info",
];

interface ColorToken {
  $type: "color";
  $value: { colorSpace: "srgb"; components: number[] };
}

interface AliasToken {
  $type: "color";
  $value: TokenRef;
}

/** sRGB byte / 255, rounded to 6 decimals (round-trips through `byteToHex`). */
function componentsOf(hex: string): number[] {
  const components: number[] = [];
  for (let i = 1; i < 7; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    components.push(Math.round((byte / 255) * 1e6) / 1e6);
  }
  return components;
}

function colorToken(hex: string): ColorToken {
  return {
    $type: "color",
    $value: { colorSpace: "srgb", components: componentsOf(hex) },
  };
}

function alias(ref: TokenRef): AliasToken {
  return { $type: "color", $value: ref };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** `primitives/colors.tokens.json`: white, black, then each ramp 50 -> 950. */
export function emitPrimitives(ramps: Record<RampName, Ramp>): string {
  const primitive: Record<string, unknown> = {
    white: colorToken("#ffffff"),
    black: colorToken("#000000"),
  };

  for (const name of RAMP_ORDER) {
    const group: Record<string, ColorToken> = {};
    for (const step of STEPS) {
      group[String(step)] = colorToken(ramps[name][step]);
    }
    primitive[name] = group;
  }

  return serialize({ color: { primitive } });
}

/** `semantic/{light,dark}.tokens.json`: role aliases plus the compat group. */
export function emitSemantic(roles: Record<RoleId, TokenRef>): string {
  for (const role of Object.keys(roles)) {
    if (!ROLE_ORDER.includes(role as RoleId)) {
      throw new Error(`emit: no canonical key order for role ${role}`);
    }
  }

  const color: Record<string, Record<string, unknown>> = {};
  for (const role of ROLE_ORDER) {
    const [group, name] = role.split(".") as [string, string];
    (color[group] ??= {})[name] = alias(roles[role]);
  }

  // Compat aliases-of-aliases so the ui-web / ui-native templates and examples
  // keep working unchanged. `color.border.default` is in the compat list too,
  // but it is already the `border.default` role token above; re-emitting it
  // would be a self-referencing alias.
  color["surface"] = {
    canvas: alias("{color.bg.canvas}"),
    card: alias("{color.bg.surface}"),
    elevated: alias("{color.bg.surface}"),
    sunken: alias("{color.bg.subtle}"),
  };
  color["text"] = {
    primary: alias("{color.fg.default}"),
    secondary: alias("{color.fg.muted}"),
    "on-action": alias("{color.fg.onBrand}"),
  };
  color["action"] = {
    primary: {
      background: alias("{color.brand.default}"),
      foreground: alias("{color.fg.onBrand}"),
      pressed: alias("{color.brand.active}"),
    },
  };
  color["feedback"] = {
    error: { foreground: alias("{color.status.danger}") },
  };
  color["focus"] = { ring: alias("{color.brand.default}") };

  return serialize({ color });
}
