import { fileURLToPath } from "node:url";
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import stylex from "@stylexjs/unplugin";
import type { UserOptions as StylexUserOptions } from "@stylexjs/unplugin";

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
  unstable_moduleResolution: {
    type: "commonJS",
    rootDir: workspaceRoot,
    themeFileExtension: "stylex",
  },
  useCSSLayers: false,
};

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: "./static/index.html",
  },
  tools: {
    rspack(_config, { prependPlugins }) {
      // The Rspack adapter transforms modules but does not attach its collected
      // rules to Rsbuild's emitted CSS. The webpack adapter uses Rspack's
      // compatible plugin API and does.
      prependPlugins(stylex.webpack(stylexOptions));
    },
  },
});
