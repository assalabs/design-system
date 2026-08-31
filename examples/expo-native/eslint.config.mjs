import { expoConfig } from "@assalabs/eslint-config/expo";

export default [
  {
    ignores: ["dist/**"],
  },
  ...expoConfig,
];
