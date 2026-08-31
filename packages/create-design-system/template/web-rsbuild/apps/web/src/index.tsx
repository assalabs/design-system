import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

/**
 * StyleX rewrites every `colors.x` reference into a static class name and drops
 * the import that produced it, so under Rspack/webpack nothing would keep the
 * token module in the graph and its `stylex.defineVars` declarations would
 * never be collected into the stylesheet. (Vite and Rollup get this for free
 * via the plugin's `treeshakeCompensation`; the webpack adapter does not.)
 * This side-effect import pins it.
 */
import "{{scope}}/theme/tokens.stylex.ts";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Expected an element with id "root" in index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
