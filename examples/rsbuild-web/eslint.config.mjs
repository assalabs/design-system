import { reactConfig } from "@assalabs/eslint-config/react";
import { reactRefreshConfig } from "@assalabs/eslint-config/react-refresh";

export default [
  {
    ignores: ["dist/**", "rsbuild.config.ts"],
  },
  ...reactConfig,
  ...reactRefreshConfig,
];
