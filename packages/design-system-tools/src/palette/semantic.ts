import { parse } from "culori";
import { contrastRatio } from "../validation.js";
import { PaletteError } from "./errors.js";
import { STEPS, type Ramp, type Step } from "./ladder.js";

export type Theme = "light" | "dark";

export type RampName =
  "brand" | "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export type Primitives = Record<RampName, { ramp: Ramp; anchor: Step }>;

export type RoleId =
  | "bg.canvas"
  | "bg.surface"
  | "bg.subtle"
  | "fg.default"
  | "fg.muted"
  | "fg.onBrand"
  | "border.default"
  | "border.strong"
  | "brand.default"
  | "brand.hover"
  | "brand.active"
  | "accent.default"
  | "status.success"
  | "status.warning"
  | "status.danger"
  | "status.info";

/** Token reference string, e.g. `{color.primitive.brand.500}`. */
export type TokenRef = string;

/** Primitive color id: `white`, `black`, or `<ramp>.<step>`. */
type Prim = "white" | "black" | `${RampName}.${Step}`;

export interface ContrastPairSpec {
  fg: RoleId;
  bg: RoleId;
  minimum: number;
}

export interface ContrastReportEntry extends ContrastPairSpec {
  ratio: number;
}

export interface SelectRolesResult {
  roles: Record<RoleId, TokenRef>;
  report: ContrastReportEntry[];
}

export const SCAFFOLD_CONTRAST_PAIRS: readonly ContrastPairSpec[] = [
  { fg: "fg.default", bg: "bg.canvas", minimum: 4.5 },
  { fg: "fg.muted", bg: "bg.canvas", minimum: 4.5 },
  { fg: "fg.muted", bg: "bg.surface", minimum: 4.5 },
  { fg: "fg.onBrand", bg: "brand.default", minimum: 4.5 },
  { fg: "border.strong", bg: "bg.canvas", minimum: 3 },
  { fg: "status.success", bg: "bg.canvas", minimum: 3 },
  { fg: "status.warning", bg: "bg.canvas", minimum: 3 },
  { fg: "status.danger", bg: "bg.canvas", minimum: 3 },
  { fg: "status.info", bg: "bg.canvas", minimum: 3 },
];

const BG_ROLES: readonly RoleId[] = ["bg.canvas", "bg.surface", "bg.subtle"];

const SINGLE_LIST_ROLES: readonly RoleId[] = [
  "fg.default",
  "fg.muted",
  "border.default",
  "border.strong",
  "accent.default",
  "status.success",
  "status.warning",
  "status.danger",
  "status.info",
];

function stepsFrom(start: Step, direction: 1 | -1): Step[] {
  const index = STEPS.indexOf(start);
  const out: Step[] = [];
  for (let i = index + direction; i >= 0 && i < STEPS.length; i += direction) {
    out.push(STEPS[i]!);
  }
  return out;
}

function clampStep(step: Step, offset: number): Step {
  const index = STEPS.indexOf(step) + offset;
  return STEPS[Math.min(Math.max(index, 0), STEPS.length - 1)]!;
}

function statusCandidates(ramp: RampName, theme: Theme): Prim[] {
  return theme === "light"
    ? [`${ramp}.600`, `${ramp}.700`, `${ramp}.800`]
    : [`${ramp}.400`, `${ramp}.300`];
}

function candidatesFor(
  role: RoleId,
  theme: Theme,
  primitives: Primitives,
): Prim[] {
  const light = theme === "light";
  switch (role) {
    case "bg.canvas":
      return light ? ["white"] : ["neutral.950"];
    case "bg.surface":
      return light ? ["neutral.50"] : ["neutral.900"];
    case "bg.subtle":
      return light ? ["neutral.100"] : ["neutral.800"];
    case "fg.default":
      return light ? ["neutral.950", "neutral.900"] : ["neutral.50", "white"];
    case "fg.muted":
      return light
        ? ["neutral.700", "neutral.800", "neutral.900"]
        : ["neutral.300", "neutral.200", "neutral.100"];
    case "border.default":
      return light
        ? ["neutral.200", "neutral.300"]
        : ["neutral.800", "neutral.700"];
    case "border.strong":
      return light
        ? ["neutral.400", "neutral.500"]
        : ["neutral.600", "neutral.500"];
    case "accent.default": {
      if (!light) return ["accent.400", "accent.300"];
      const a = primitives.accent.anchor;
      const steps = [a, ...stepsFrom(a, 1).filter((s) => s <= 800)];
      return steps.map((s): Prim => `accent.${s}`);
    }
    case "status.success":
    case "status.warning":
    case "status.danger":
    case "status.info":
      return statusCandidates(role.slice("status.".length) as RampName, theme);
    default:
      throw new Error(`No candidate list for role ${role}`);
  }
}

function toRef(prim: Prim): TokenRef {
  return `{color.primitive.${prim}}`;
}

function primHex(prim: Prim, primitives: Primitives): string {
  if (prim === "white") return "#ffffff";
  if (prim === "black") return "#000000";
  const [ramp, step] = prim.split(".") as [RampName, string];
  return primitives[ramp].ramp[Number(step) as Step];
}

function contrastHex(fgHex: string, bgHex: string): number {
  const toColor = (hex: string) => {
    const rgb = parse(hex);
    if (!rgb || rgb.mode !== "rgb") {
      throw new Error(`Invalid primitive color: ${hex}`);
    }
    return { colorSpace: "srgb", components: [rgb.r, rgb.g, rgb.b] };
  };
  return contrastRatio(toColor(fgHex), toColor(bgHex));
}

export function selectRoles(
  primitives: Primitives,
  theme: Theme,
): SelectRolesResult {
  const light = theme === "light";
  const chosen = {} as Record<RoleId, Prim>;
  const hexOf = (role: RoleId) => primHex(chosen[role], primitives);

  for (const role of BG_ROLES) {
    chosen[role] = candidatesFor(role, theme, primitives)[0]!;
  }

  for (const role of SINGLE_LIST_ROLES) {
    const pairs = SCAFFOLD_CONTRAST_PAIRS.filter(
      (p) =>
        (p.fg === role || p.bg === role) &&
        chosen[p.fg === role ? p.bg : p.fg] !== undefined,
    );
    let best: { pair: ContrastPairSpec; ratio: number } | undefined;
    let ok = false;
    for (const cand of candidatesFor(role, theme, primitives)) {
      chosen[role] = cand;
      ok = true;
      for (const pair of pairs) {
        const ratio = contrastHex(hexOf(pair.fg), hexOf(pair.bg));
        if (ratio + Number.EPSILON < pair.minimum) {
          ok = false;
          if (!best || ratio > best.ratio) best = { pair, ratio };
          break;
        }
      }
      if (ok) break;
    }
    if (!ok) {
      const detail = best
        ? `${best.pair.fg}/${best.pair.bg} >= ${best.pair.minimum} (best ${best.ratio.toFixed(2)})`
        : "its contrast pairs (empty candidate list)";
      throw new PaletteError(
        `${theme}: no candidate for ${role} satisfies ${detail}`,
      );
    }
  }

  // brand.default + fg.onBrand resolved jointly: anchor -> darker -> lighter.
  const anchor = primitives.brand.anchor;
  const walk: Step[] = [
    anchor,
    ...stepsFrom(anchor, 1),
    ...stepsFrom(anchor, -1),
  ];
  const neutral950 = primHex("neutral.950", primitives);
  let brandStep: Step | undefined;
  let bestRatio = 0;
  let bestStep: Step = anchor;
  for (const step of walk) {
    const hex = primitives.brand.ramp[step];
    const cW = contrastHex("#ffffff", hex);
    const cN = contrastHex(neutral950, hex);
    const best = Math.max(cW, cN);
    if (best > bestRatio) {
      bestRatio = best;
      bestStep = step;
    }
    if (best + Number.EPSILON >= 4.5) {
      brandStep = step;
      chosen["brand.default"] = `brand.${step}`;
      chosen["fg.onBrand"] = cW >= cN ? "white" : "neutral.950";
      break;
    }
  }
  if (brandStep === undefined) {
    throw new PaletteError(
      `${theme}: no brand step satisfies fg.onBrand/brand.default >= 4.5 (best ${bestRatio.toFixed(2)} at brand.${bestStep})`,
    );
  }
  const direction = light ? 1 : -1;
  chosen["brand.hover"] = `brand.${clampStep(brandStep, direction)}`;
  chosen["brand.active"] = `brand.${clampStep(brandStep, 2 * direction)}`;

  const report = SCAFFOLD_CONTRAST_PAIRS.map((pair) => ({
    ...pair,
    ratio: contrastHex(hexOf(pair.fg), hexOf(pair.bg)),
  }));

  const roles = Object.fromEntries(
    Object.entries(chosen).map(([role, prim]) => [role, toRef(prim as Prim)]),
  ) as Record<RoleId, TokenRef>;

  return { roles, report };
}
