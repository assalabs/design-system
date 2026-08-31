import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import type { UserOptions as StylexUserOptions } from "@stylexjs/unplugin";
import { defineConfig } from "vite";

/**
 * `unstable_moduleResolution.rootDir` must be the workspace root, not the app
 * directory: StyleX derives each variable name from the theme file's path
 * relative to `rootDir`, and the theme lives in a sibling package.
 */
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

/** `externalPackages` is accepted by the plugin but missing from `UserOptions`. */
type StylexOptions = Partial<StylexUserOptions> & {
  externalPackages: string[];
};

const stylexOptions: StylexOptions = {
  // The theme ships `tokens.stylex.ts` as source, so StyleX has to compile it
  // as part of this build rather than treat it as an opaque dependency.
  externalPackages: ["{{scope}}/theme"],
  lightningcssOptions: { minify: true },
  // Styles are extracted into the emitted stylesheet at build time, so the
  // bundle must never fall back to injecting them from JavaScript.
  runtimeInjection: false,
  unstable_moduleResolution: {
    type: "commonJS",
    rootDir: workspaceRoot,
    themeFileExtension: "stylex",
  },
  // Order the emitted rules with `@layer` instead of repeated-class specificity
  // hacks, which keeps the generated theme stylesheet easy to override.
  useCSSLayers: true,
};

// Docs: https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stylex.vite(stylexOptions)],
});
