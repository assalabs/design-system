import { registerRootComponent } from "expo";
import { configureUnistyles } from "{{scope}}/theme/unistyles";

/**
 * Metro's `require`, declared locally so this entry needs no extra `@types`
 * package. `App` cannot be a static `import`: ES imports are evaluated before
 * this module's body, while `App.tsx` calls `StyleSheet.create` at module
 * scope and Unistyles only allows that after `StyleSheet.configure`.
 */
declare const require: (path: "./App") => typeof import("./App");

configureUnistyles();

registerRootComponent(require("./App").default);
