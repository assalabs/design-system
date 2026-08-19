import assert from "node:assert/strict";
import test from "node:test";
import {
  contrastRatio,
  defineDesignSystem,
  toNativeTokenValue,
} from "../dist/index.js";

const black = { colorSpace: "srgb", components: [0, 0, 0] };
const white = { colorSpace: "srgb", components: [1, 1, 1] };

test("contrastRatio implements the WCAG relative-luminance calculation", () => {
  assert.equal(contrastRatio(black, white), 21);
});

test("toNativeTokenValue converts DTCG colors and dimensions", () => {
  assert.equal(
    toNativeTokenValue({
      id: "color.brand.primary",
      $type: "color",
      $value: { colorSpace: "srgb", components: [1, 0.5, 0], alpha: 0.5 },
    }),
    "#ff800080",
  );
  assert.equal(
    toNativeTokenValue({
      id: "dimension.space.4",
      $type: "dimension",
      $value: { value: 16, unit: "px" },
    }),
    16,
  );
});

test("defineDesignSystem rejects unsafe prefixes", () => {
  assert.throws(
    () =>
      defineDesignSystem({
        name: "Example",
        prefix: "Bad Prefix",
        source: "tokens.json",
        themes: ["light", "dark"],
        defaultTheme: "light",
        outputs: { css: "tokens.css" },
      }),
    /prefix/,
  );
});
