/**
 * Guards the two ways a StyleX build silently degrades: the compiler is wired
 * up but its collected rules never reach the emitted CSS, or it never ran at
 * all and `stylex.defineVars` ships to the browser as a runtime call.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cssDirectory = fileURLToPath(
  new URL("../dist/static/css/", import.meta.url),
);
const javascriptDirectory = fileURLToPath(
  new URL("../dist/static/js/", import.meta.url),
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

console.log("StyleX build output looks correct.");
