import { clampChroma, formatHex, oklch, parse } from "culori";

export const STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

export type Step = (typeof STEPS)[number];

export type Ramp = Record<Step, string>;

export const L_REF: Record<Step, number> = {
  50: 0.975,
  100: 0.94,
  200: 0.885,
  300: 0.805,
  400: 0.705,
  500: 0.605,
  600: 0.52,
  700: 0.44,
  800: 0.37,
  900: 0.3,
  950: 0.22,
};

export const CHROMA_MULT: Record<Step, number> = {
  50: 0.15,
  100: 0.28,
  200: 0.48,
  300: 0.68,
  400: 0.88,
  500: 1,
  600: 0.96,
  700: 0.86,
  800: 0.72,
  900: 0.56,
  950: 0.4,
};

const MAX_CHROMA = 0.37;

export interface BuildRampOptions {
  anchor?: Step;
}

export interface BuildRampResult {
  ramp: Ramp;
  anchor: Step;
}

function nearestStep(l: number): Step {
  let best: Step = STEPS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const step of STEPS) {
    const distance = Math.abs(L_REF[step] - l);
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

function isAchromatic(value: number | undefined): value is undefined {
  return value === undefined || Number.isNaN(value);
}

function lightnessFor(step: Step, anchor: Step, seedL: number): number {
  if (step === anchor) {
    return seedL;
  }
  const lo: Step = 50;
  const hi: Step = 950;
  // Extreme anchors degenerate one side; fall back to the other end formula.
  const useLightSide = step < anchor ? anchor !== lo : anchor === hi;
  const end = useLightSide ? L_REF[lo] : L_REF[hi];
  return end + ((seedL - end) * (L_REF[step] - end)) / (L_REF[anchor] - end);
}

export function buildRamp(
  seedHex: string,
  options: BuildRampOptions = {},
): BuildRampResult {
  const parsed = parse(seedHex);
  if (!parsed) {
    throw new Error(`Invalid seed color: ${seedHex}`);
  }
  const seed = oklch(parsed);
  const achromatic = isAchromatic(seed.c) || isAchromatic(seed.h);
  const seedL = seed.l;
  const seedC = achromatic ? 0 : seed.c;
  const seedH = achromatic ? 0 : seed.h;

  const anchor = options.anchor ?? nearestStep(seedL);
  const anchorMult = CHROMA_MULT[anchor];

  const ramp = {} as Ramp;
  for (const step of STEPS) {
    if (step === anchor) {
      ramp[step] = seedHex.toLowerCase();
      continue;
    }
    const l = lightnessFor(step, anchor, seedL);
    const c = Math.min((seedC * CHROMA_MULT[step]) / anchorMult, MAX_CHROMA);
    const inGamut = clampChroma(
      { mode: "oklch", l, c, h: seedH },
      "oklch",
      "rgb",
    );
    ramp[step] = formatHex(inGamut);
  }

  return { ramp, anchor };
}
