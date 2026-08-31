/**
 * Guards the three ways a StyleX build silently degrades: the compiler is wired
 * up but its collected rules never reach the emitted CSS, it never ran at all
 * and `stylex.defineVars` ships to the browser as a runtime call, or the
 * variables compile but the theme override they carry never applies.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cssDirectory = fileURLToPath(new URL("../dist/assets/", import.meta.url));
const javascriptDirectory = fileURLToPath(
  new URL("../dist/assets/", import.meta.url),
);

async function readAssets(directory, extension) {
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith(extension),
  );

  return (
    await Promise.all(
      files.map((file) => readFile(join(directory, file), "utf8")),
    )
  ).join("\n");
}

/**
 * Body of the first top-level rule for `selector`. Minifiers drop the space
 * before `{` and the quotes inside the attribute selector, so the opener stays
 * tolerant of both.
 */
function themeBlock(css, theme) {
  const opener = new RegExp(
    `(?:^|[};])\\s*\\[data-theme=["']?${theme}["']?\\]\\s*\\{`,
  );
  const match = css.match(opener);

  if (!match) {
    return undefined;
  }

  let depth = 1;
  let index = match.index + match[0].length;
  const start = index;

  while (index < css.length && depth > 0) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
    }
    index += 1;
  }

  return css.slice(start, index - 1);
}

function declarationValue(body, name) {
  const match = body.match(
    new RegExp(`(?:^|[;{])\\s*${name}\\s*:\\s*([^;}]+)`),
  );

  return match ? match[1].trim() : undefined;
}

/** Follows `var(--a)` -> `var(--b)` -> literal inside one declaration block. */
function resolveWithin(body, name, depth = 0) {
  assert.ok(depth < 20, `Custom property ${name} never resolves to a literal`);

  const value = declarationValue(body, name);

  if (value === undefined) {
    return undefined;
  }

  const alias = value.match(/^var\((--[a-zA-Z0-9-]+)\)$/);

  return alias ? resolveWithin(body, alias[1], depth + 1) : value;
}

const css = await readAssets(cssDirectory, ".css");
const javascript = await readAssets(javascriptDirectory, ".js");

assert.ok(css.length > 0, "Expected the web build to emit CSS");

assert.match(
  css,
  /--x[a-z0-9]+:/,
  "Expected compiled StyleX variables; the plugin did not reach the emitted CSS",
);

// Minifiers drop the space after the colon and the quotes around the value, so
// both assertions stay tolerant of the whitespace and quoting they may remove.
assert.match(
  css,
  /prefers-color-scheme:\s*dark/,
  "Expected a dark colour-scheme block so the page follows the system theme",
);
assert.match(
  css,
  /\[data-theme=["']?dark["']?\]/,
  'Expected a [data-theme="dark"] block so ThemeToggle can pin the theme',
);
assert.match(
  css,
  /--{{prefix}}-color-bg-canvas:/,
  "Expected the generated theme stylesheet; is styles.css importing {{scope}}/theme/css?",
);

assert.doesNotMatch(
  javascript,
  /stylex\.(?:create|defineVars)/,
  "Found uncompiled StyleX calls in the bundle",
);

// `stylex.defineVars` cannot express an ancestor-attribute override: StyleX
// reads every non-`default` key of a value object as an at-rule, so a selector
// key is emitted as a nested rule with no `&` and lowers to a *descendant*
// selector. `:root` is never a descendant of itself, so such a rule is dead.
assert.doesNotMatch(
  css,
  /\[data-theme=[^\]]*\]\s+:root/,
  "Found a [data-theme] override lowered to a descendant selector, so it can never match",
);

// The assertions above all pass on the theme stylesheet alone. These prove the
// StyleX side: that its atoms read the themed custom properties, and that
// flipping data-theme really does change what a StyleX colour resolves to.
const themeVariableFor = new Map();

for (const [, stylexVariable, themeVariable] of css.matchAll(
  /(--x[a-z0-9]+)\s*:\s*var\((--{{prefix}}-[a-zA-Z0-9-]+)\)/g,
)) {
  themeVariableFor.set(stylexVariable, themeVariable);
}

assert.ok(
  themeVariableFor.size > 0,
  "Expected compiled StyleX variables to alias the --{{prefix}}-* custom properties",
);

const CANVAS = "--{{prefix}}-color-bg-canvas";
const canvasVariable = [...themeVariableFor].find(
  ([, themeVariable]) => themeVariable === CANVAS,
)?.[0];

assert.ok(canvasVariable, `Expected a StyleX variable aliasing ${CANVAS}`);

const painted = css.match(
  new RegExp(
    `\\.(x[a-z0-9]+)[^{]*\\{background-color:\\s*var\\(${canvasVariable}\\)`,
  ),
);

assert.ok(
  painted,
  `Expected a compiled rule painting a background with ${CANVAS}`,
);
assert.ok(
  javascript.includes(painted[1]),
  `Compiled class .${painted[1]} never reaches the bundle, so nothing is painted with ${CANVAS}`,
);

const light = themeBlock(css, "light");
const dark = themeBlock(css, "dark");

assert.ok(
  light && dark,
  "Expected [data-theme] blocks in the theme stylesheet",
);

const lightCanvas = resolveWithin(light, CANVAS);
const darkCanvas = resolveWithin(dark, CANVAS);

assert.ok(
  lightCanvas && darkCanvas,
  `Expected ${CANVAS} to be declared under both [data-theme] blocks`,
);
assert.notEqual(
  lightCanvas,
  darkCanvas,
  `Toggling data-theme must change what ${CANVAS} resolves to (light ${lightCanvas}, dark ${darkCanvas})`,
);

console.log(
  `StyleX build output looks correct: ${canvasVariable} -> ${CANVAS} resolves to ${lightCanvas} under [data-theme=light] and ${darkCanvas} under [data-theme=dark].`,
);
