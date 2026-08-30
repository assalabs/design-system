import { clampChroma, formatHex, oklch, parse } from "culori";

// Leaf module: no relative imports so it can be loaded standalone.
// L_REF[500] from ladder.ts, inlined on purpose.
const L_500 = 0.605;

type Step = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

export interface PaletteInput {
  brand: string;
  neutral?: string | "gray";
  accent?: string;
}

export interface Seed {
  seedHex: string;
  /** `undefined` lets buildRamp pick the nearest-L step (user-supplied seeds). */
  anchor: Step | undefined;
}

export interface DerivedSeeds {
  brand: Seed;
  neutral: Seed;
  accent: Seed;
  success: Seed;
  warning: Seed;
  danger: Seed;
  info: Seed;
}

export class PaletteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaletteError";
  }
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

const STATUS_HUES = {
  success: 145,
  warning: 80,
  danger: 25,
  info: 250,
} as const;

function assertHex(value: string, flag: string): string {
  if (!HEX_RE.test(value)) {
    throw new PaletteError(
      `Invalid ${flag} color "${value}": expected #RRGGBB hex`,
    );
  }
  return value.toLowerCase();
}

function toHex(l: number, c: number, h: number): string {
  return formatHex(clampChroma({ mode: "oklch", l, c, h }, "oklch", "rgb"));
}

// 8-bit sRGB quantization can push a near-gray hex slightly above its target
// chroma; step the chroma down until the emitted hex stays within the ceiling.
function toHexMaxChroma(l: number, c: number, h: number): string {
  let hex = toHex(l, c, h);
  for (let i = 0; i < 8 && (oklch(parse(hex)!).c ?? 0) > c; i += 1) {
    hex = toHex(l, c * (1 - 0.1 * (i + 1)), h);
  }
  return hex;
}

function given(hex: string, flag: string): Seed {
  return { seedHex: assertHex(hex, flag), anchor: undefined };
}

function derived(l: number, c: number, h: number): Seed {
  return { seedHex: toHex(l, c, h), anchor: 500 };
}

export function deriveSeeds(input: PaletteInput): DerivedSeeds {
  const brandHex = assertHex(input.brand, "brand");
  const b = oklch(parse(brandHex)!);
  const bc = Number.isNaN(b.c) ? 0 : (b.c ?? 0);
  const bh = b.h === undefined || Number.isNaN(b.h) ? 0 : b.h;

  const neutral =
    input.neutral === undefined || input.neutral === "gray"
      ? {
          seedHex: toHexMaxChroma(
            L_500,
            input.neutral === "gray" ? 0 : Math.min(0.015, bc),
            bh,
          ),
          anchor: 500 as const,
        }
      : given(input.neutral, "neutral");

  const accent =
    input.accent === undefined
      ? derived(L_500, bc, (bh + 150) % 360)
      : given(input.accent, "accent");

  const statusChroma = Math.min(Math.max(bc, 0.09), 0.19);
  const status = (h: number): Seed => derived(L_500, statusChroma, h);

  return {
    brand: { seedHex: brandHex, anchor: undefined },
    neutral,
    accent,
    success: status(STATUS_HUES.success),
    warning: status(STATUS_HUES.warning),
    danger: status(STATUS_HUES.danger),
    info: status(STATUS_HUES.info),
  };
}
