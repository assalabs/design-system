import { baseConfig } from "@assalabs/eslint-config/base";

export default [
  {
    ignores: ["dist/**", "template/**"],
  },
  ...baseConfig,
];
