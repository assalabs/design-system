import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { differenceEuclidean, oklch, parse } from "culori";
import {
  buildRamp,
  deriveSeeds,
  generatePalette,
  PaletteError,
  SCAFFOLD_CONTRAST_PAIRS,
  selectRoles,
  STEPS,
} from "../dist/index.js";

/** Emission order from emit.ts — every ramp `selectRoles` may read. */
const RAMP_ORDER = [
  "brand",
  "neutral",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
];

/** The seed corpus the palette rules are specified against. */
const CORPUS = [
  "#FF3131",
  "#123456",
  "#000000",
  "#ffffff",
  "#808080",
  "#00ff00",
  "#fff5f5",
];

/** Seeds with real chroma at a mid lightness: hue survives gamut mapping. */
const CHROMATIC_MID = ["#FF3131", "#123456", "#00ff00"];

/** Seeds culori reports as `c === 0` / `h === undefined` on both sides. */
const ACHROMATIC = ["#000000", "#ffffff", "#808080"];

const ROLE_KEYS = [
  "accent.default",
  "bg.canvas",
  "bg.subtle",
  "bg.surface",
  "border.default",
  "border.strong",
  "brand.active",
  "brand.default",
  "brand.hover",
  "fg.default",
  "fg.muted",
  "fg.onBrand",
  "status.danger",
  "status.info",
  "status.success",
  "status.warning",
];

const HEX_RE = /^#[0-9a-f]{6}$/;

const deltaE = differenceEuclidean("oklab");

const SNAPSHOT = fileURLToPath(
  new URL("./__snapshots__/palette-ff3131.json", import.meta.url),
);

function lightnessOf(hex) {
  return oklch(parse(hex)).l;
}

function chromaOf(hex) {
  return oklch(parse(hex)).c;
}

function hueOf(hex) {
  return oklch(parse(hex)).h;
}

/**
 * Rebuilds exactly the `Primitives` map `generatePalette` hands to
 * `selectRoles`, so a test can doctor one ramp step and drive the real
 * selection code down a branch no valid seed reaches. The
 * "doctored primitives reproduce the real pipeline" test below is what keeps
 * this harness honest.
 */
function buildPrimitives(input) {
  const seeds = deriveSeeds(input);
  const primitives = {};
  for (const name of RAMP_ORDER) {
    primitives[name] = buildRamp(seeds[name].seedHex, {
      anchor: seeds[name].anchor,
    });
  }
  return primitives;
}

function paletteErrorFrom(primitives, theme) {
  let thrown;
  try {
    selectRoles(primitives, theme);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `expected selectRoles(${theme}) to throw`);
  assert.ok(
    thrown instanceof PaletteError,
    `expected a PaletteError, got ${thrown?.name}`,
  );
  return thrown.message;
}

test("every emitted primitive is a lowercase 6-digit hex", () => {
  for (const brand of CORPUS) {
    const { primitives, files } = generatePalette({ brand });
    for (const name of RAMP_ORDER) {
      for (const step of STEPS) {
        assert.match(
          primitives[name][step],
          HEX_RE,
          `${brand} ${name}.${step}`,
        );
      }
    }
    // The DTCG files carry components, not hex, so nothing uppercase can leak
    // through them either.
    assert.ok(!/#[0-9A-Fa-f]{6}/.test(files["primitives/colors.tokens.json"]));
  }
});

test("ladder lightness decreases strictly from 50 to 950 on every ramp", () => {
  for (const brand of CORPUS) {
    const { primitives } = generatePalette({ brand });
    for (const name of RAMP_ORDER) {
      let previous = Number.POSITIVE_INFINITY;
      for (const step of STEPS) {
        const l = lightnessOf(primitives[name][step]);
        assert.ok(
          l < previous,
          `${brand} ${name}: L at ${step} is ${l}, not below ${previous}`,
        );
        previous = l;
      }
    }
  }
});

test("the anchor step reproduces the seed hex exactly", () => {
  const expected = [
    ["#FF3131", 500],
    ["#123456", 900],
    ["#ffffff", 50],
    ["#000000", 950],
  ];
  for (const [brand, anchor] of expected) {
    const { primitives, anchors } = generatePalette({ brand });
    assert.equal(anchors.brand, anchor, `${brand} anchor step`);
    // Delta-E first: it is the property that matters (the anchor must BE the
    // seed, not a near miss), and asserting it before the string equality is
    // what keeps this assertion killable rather than shadowed.
    const distance = deltaE(parse(brand), parse(primitives.brand[anchor]));
    assert.ok(distance < 1, `${brand} anchor deltaE ${distance}`);
    assert.equal(distance, 0, `${brand} anchor is not the seed color`);
    assert.equal(primitives.brand[anchor], brand.toLowerCase());
  }
});

test("neutral chroma never exceeds 0.015", () => {
  for (const brand of CORPUS) {
    const { primitives } = generatePalette({ brand });
    for (const step of STEPS) {
      const c = chromaOf(primitives.neutral[step]);
      assert.ok(c <= 0.015, `${brand} neutral.${step} chroma ${c}`);
    }
  }
});

test("accent sits 150 degrees from brand for chromatic mid-lightness seeds", () => {
  for (const brand of CHROMATIC_MID) {
    const { primitives, anchors } = generatePalette({ brand });
    const brandHue = hueOf(brand);
    const accentHue = hueOf(primitives.accent[anchors.accent]);
    const delta = (accentHue - brandHue + 720) % 360;
    // Measured: #FF3131 150.39, #123456 149.72, #00ff00 150.08.
    assert.ok(
      Math.abs(delta - 150) <= 0.5,
      `${brand}: accent hue is ${delta} degrees from brand`,
    );
  }
});

test("a near-white chromatic seed drifts off 150 degrees but stays bounded", () => {
  // clampChroma gamut-maps the derived accent seed, which moves its hue. This
  // is why the +-0.5 assertion above cannot be applied to the whole corpus.
  const { primitives, anchors } = generatePalette({ brand: "#fff5f5" });
  const delta =
    (hueOf(primitives.accent[anchors.accent]) - hueOf("#fff5f5") + 720) % 360;
  assert.ok(delta !== undefined && !Number.isNaN(delta));
  // Measured 147.31.
  assert.ok(
    Math.abs(delta - 150) <= 3,
    `#fff5f5: accent hue drifted to ${delta} degrees from brand`,
  );
});

test("achromatic seeds keep brand and accent at zero chroma and undefined hue", () => {
  for (const brand of ACHROMATIC) {
    const { primitives } = generatePalette({ brand });
    for (const name of ["brand", "accent"]) {
      for (const step of STEPS) {
        const hex = primitives[name][step];
        assert.equal(chromaOf(hex), 0, `${brand} ${name}.${step} chroma`);
        assert.equal(hueOf(hex), undefined, `${brand} ${name}.${step} hue`);
      }
    }
  }
});

test("light and dark expose the same role keys", () => {
  for (const brand of CORPUS) {
    const { semantic } = generatePalette({ brand });
    const light = Object.keys(semantic.light).sort();
    const dark = Object.keys(semantic.dark).sort();
    assert.deepEqual(light, ROLE_KEYS, `${brand} light roles`);
    assert.deepEqual(dark, ROLE_KEYS, `${brand} dark roles`);
    for (const role of ROLE_KEYS) {
      assert.match(semantic.light[role], /^\{color\.primitive\.[a-z0-9.]+\}$/);
      assert.match(semantic.dark[role], /^\{color\.primitive\.[a-z0-9.]+\}$/);
    }
  }
});

test("every contrast pair meets its minimum for the whole seed corpus", () => {
  for (const brand of CORPUS) {
    const { report } = generatePalette({ brand });
    assert.equal(report.length, SCAFFOLD_CONTRAST_PAIRS.length * 2);
    for (const entry of report) {
      const spec = SCAFFOLD_CONTRAST_PAIRS.find(
        (pair) => `${pair.fg}/${pair.bg}` === entry.pair,
      );
      assert.ok(spec, `${brand}: unknown report pair ${entry.pair}`);
      assert.equal(entry.minimum, spec.minimum);
      assert.ok(
        entry.ratio + Number.EPSILON >= entry.minimum,
        `${brand} ${entry.theme} ${entry.pair}: ${entry.ratio} < ${entry.minimum}`,
      );
    }
    for (const theme of ["light", "dark"]) {
      assert.equal(
        report.filter((entry) => entry.theme === theme).length,
        SCAFFOLD_CONTRAST_PAIRS.length,
      );
    }
  }
});

test("#FF3131 resolves the brand joint walk at the anchor", () => {
  const { semantic } = generatePalette({ brand: "#FF3131" });
  assert.equal(semantic.light["brand.default"], "{color.primitive.brand.500}");
  assert.equal(semantic.light["fg.onBrand"], "{color.primitive.neutral.950}");
  assert.equal(semantic.light["brand.hover"], "{color.primitive.brand.600}");
  assert.equal(semantic.light["brand.active"], "{color.primitive.brand.700}");
  // Dark walks the ramp the other way from the same step.
  assert.equal(semantic.dark["brand.default"], "{color.primitive.brand.500}");
  assert.equal(semantic.dark["fg.onBrand"], "{color.primitive.neutral.950}");
  assert.equal(semantic.dark["brand.hover"], "{color.primitive.brand.400}");
  assert.equal(semantic.dark["brand.active"], "{color.primitive.brand.300}");
});

test("an invalid seed hex throws PaletteError naming the flag", () => {
  const cases = [
    [{ brand: "red" }, '--brand must be #RRGGBB (got "red")'],
    [
      { brand: "#FF3131", neutral: "nope" },
      '--neutral must be #RRGGBB (got "nope")',
    ],
    [
      { brand: "#FF3131", accent: "#12345" },
      '--accent must be #RRGGBB (got "#12345")',
    ],
  ];
  for (const [input, message] of cases) {
    assert.throws(
      () => generatePalette(input),
      (error) => {
        assert.ok(error instanceof PaletteError);
        assert.equal(error.name, "PaletteError");
        assert.equal(error.message, message);
        return true;
      },
    );
  }
});

test("doctored primitives reproduce the real pipeline", () => {
  // Without this the two forced-throw tests below would prove nothing: they
  // would be exercising a harness, not the code generatePalette runs.
  for (const brand of CORPUS) {
    const primitives = buildPrimitives({ brand });
    const real = generatePalette({ brand });
    for (const name of RAMP_ORDER) {
      assert.deepEqual(primitives[name].ramp, real.primitives[name]);
    }
    assert.deepEqual(
      selectRoles(primitives, "light").roles,
      real.semantic.light,
    );
    assert.deepEqual(selectRoles(primitives, "dark").roles, real.semantic.dark);
  }
});

test("an unsatisfiable role reports the failing pair's own minimum", () => {
  // No valid seed reaches these branches, so they have to be forced.

  // border.strong / bg.canvas has minimum 3, not 4.5.
  const strong = buildPrimitives({ brand: "#FF3131" });
  strong.neutral.ramp[400] = "#ffffff";
  strong.neutral.ramp[500] = "#ffffff";
  assert.equal(
    paletteErrorFrom(strong, "light"),
    "light: no candidate for color.border.strong satisfies border.strong/bg.canvas ≥ 3 (best 1.00)",
  );

  // status.* pairs are minimum 3 too.
  const danger = buildPrimitives({ brand: "#FF3131" });
  for (const step of [600, 700, 800]) danger.danger.ramp[step] = "#ffffff";
  assert.equal(
    paletteErrorFrom(danger, "light"),
    "light: no candidate for color.status.danger satisfies status.danger/bg.canvas ≥ 3 (best 1.00)",
  );

  // ...while a text pair is 4.5, which is what makes the interpolation load-bearing.
  const muted = buildPrimitives({ brand: "#FF3131" });
  for (const step of [700, 800, 900]) muted.neutral.ramp[step] = "#ffffff";
  const mutedMessage = paletteErrorFrom(muted, "light");
  assert.equal(
    mutedMessage,
    "light: no candidate for color.fg.muted satisfies fg.muted/bg.canvas ≥ 4.5 (best 1.00)",
  );
  assert.ok(mutedMessage.includes("≥"), "the message must use U+2265");

  // The theme name is interpolated as well.
  const dark = buildPrimitives({ brand: "#FF3131" });
  dark.neutral.ramp[500] = "#000000";
  dark.neutral.ramp[600] = "#000000";
  assert.equal(
    paletteErrorFrom(dark, "dark"),
    "dark: no candidate for color.border.strong satisfies border.strong/bg.canvas ≥ 3 (best 1.21)",
  );
});

test("an exhausted brand joint walk names the best ratio and step", () => {
  // Also unreachable from any seed: every step has to fail against BOTH
  // white and neutral.950, so flatten the whole brand ramp to one mid gray.
  for (const theme of ["light", "dark"]) {
    const primitives = buildPrimitives({ brand: "#FF3131" });
    for (const step of STEPS) primitives.brand.ramp[step] = "#808080";
    const message = paletteErrorFrom(primitives, theme);
    assert.equal(
      message,
      `${theme}: no candidate for color.brand.default satisfies fg.onBrand/brand.default ≥ 4.5 (best 4.38 at brand.500)`,
    );
    assert.ok(message.includes("≥"), "the message must use U+2265");
  }
});

test("generatePalette is pure and matches the committed snapshot", () => {
  const first = generatePalette({ brand: "#FF3131" }).files;
  const second = generatePalette({ brand: "#FF3131" }).files;
  for (const key of Object.keys(first)) {
    assert.equal(first[key], second[key], `${key} is not deterministic`);
  }

  if (!existsSync(SNAPSHOT)) {
    writeFileSync(SNAPSHOT, `${JSON.stringify(first, null, 2)}\n`);
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  assert.deepEqual(Object.keys(first), Object.keys(snapshot));
  for (const key of Object.keys(snapshot)) {
    assert.equal(first[key], snapshot[key], `${key} drifted from the snapshot`);
  }
});
