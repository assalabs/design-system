import { spawnSync } from "node:child_process";
import process from "node:process";

for (const platform of ["android", "ios"]) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "expo",
      "export",
      "--platform",
      platform,
      "--output-dir",
      `dist/${platform}`,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
