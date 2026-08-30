// derive.ts is intentionally a leaf module (loadable standalone via
// --experimental-strip-types), so PaletteError is defined there and only
// re-exported here for modules that import "../validation.js" anyway.
export { PaletteError } from "./derive.js";
