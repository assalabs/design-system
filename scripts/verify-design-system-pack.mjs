import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { installPackedInitializer, packPackages, run } from "./lib/pack.mjs";

const temporaryRoot = await mkdtemp(join(tmpdir(), "assalabs-ds-pack-"));

try {
  const { toolsArchive, createArchive } = await packPackages(temporaryRoot);
  const archiveListing = execFileSync("tar", ["-tf", createArchive], {
    encoding: "utf8",
  });

  const requiredTemplates = [
    "package/template/theme/tokens/theme.resolver.json",
    "package/template/ui-web/stylex/src/Button.tsx",
    "package/template/ui-web/css-modules/src/Button.tsx",
    "package/template/ui-native/unistyles/src/Button.tsx",
    "package/template/expo/apps/mobile/App.tsx",
    "package/template/web-rsbuild/apps/web/rsbuild.config.ts",
    "package/template/web-vite/apps/web/vite.config.ts",
  ];
  const missingTemplates = requiredTemplates.filter(
    (filename) => !archiveListing.includes(filename),
  );
  if (missingTemplates.length > 0) {
    throw new Error(
      `Published initializer archive is missing templates: ${missingTemplates.join(", ")}.`,
    );
  }

  const initializer = await installPackedInitializer(temporaryRoot, {
    toolsArchive,
    createArchive,
  });

  const fixtureRoot = join(temporaryRoot, "fixture");
  run(
    process.execPath,
    [
      initializer,
      "init",
      "--name",
      "Fixture",
      "--scope",
      "@fixture",
      "--prefix",
      "fx",
      "--cwd",
      fixtureRoot,
      "--template",
      "none",
      "--brand",
      "#FF3131",
      "--web",
      "stylex",
      "--native",
      "unistyles",
      "--yes",
    ],
    temporaryRoot,
  );

  const toolsPackage = JSON.parse(
    execFileSync("tar", ["-xOf", toolsArchive, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  const themePackagePath = join(fixtureRoot, "packages/theme/package.json");
  const themePackage = JSON.parse(await readFile(themePackagePath, "utf8"));
  const expectedToolsRange = `^${toolsPackage.version}`;

  if (
    themePackage.devDependencies["@assalabs/design-system-tools"] !==
    expectedToolsRange
  ) {
    throw new Error(
      `Generated theme must depend on ${expectedToolsRange}, received ${themePackage.devDependencies["@assalabs/design-system-tools"]}.`,
    );
  }

  themePackage.devDependencies["@assalabs/design-system-tools"] =
    `file:${toolsArchive}`;
  await writeFile(
    themePackagePath,
    `${JSON.stringify(themePackage, null, 2)}\n`,
  );

  const themeRoot = dirname(themePackagePath);
  await writeFile(
    join(fixtureRoot, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        packageManager: "pnpm@10.13.1",
        devDependencies: {
          "@react-native/normalize-colors": "0.83.0",
          "@types/react": "~19.2.2",
          react: "19.2.8",
          "react-native": "0.83.0",
          "react-dom": "19.2.8",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(fixtureRoot, "pnpm-workspace.yaml"),
    'packages:\n  - "apps/*"\n  - "packages/*"\n',
  );
  const stylexAppRoot = join(fixtureRoot, "apps/web");
  await mkdir(join(stylexAppRoot, "src"), { recursive: true });
  await writeFile(
    join(stylexAppRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@fixture/web",
        private: true,
        type: "module",
        scripts: { build: "vite build" },
        dependencies: {
          "@fixture/theme": "workspace:*",
          "@fixture/ui-web": "workspace:*",
          react: "19.2.8",
          "react-dom": "19.2.8",
        },
        devDependencies: {
          "@stylexjs/unplugin": "^0.19.0",
          "@vitejs/plugin-react": "6.0.5",
          vite: "8.2.1",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(stylexAppRoot, "index.html"),
    '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  );
  await writeFile(
    join(stylexAppRoot, "src/main.tsx"),
    'import "@fixture/theme/css";\nimport { Button } from "@fixture/ui-web";\nimport { createRoot } from "react-dom/client";\n\ncreateRoot(document.getElementById("root")).render(<Button>Generated button</Button>);\n',
  );
  await writeFile(
    join(stylexAppRoot, "vite.config.ts"),
    'import stylex from "@stylexjs/unplugin";\nimport react from "@vitejs/plugin-react";\nimport { fileURLToPath } from "node:url";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [stylex.vite({ useCSSLayers: true, runtimeInjection: false, treeshakeCompensation: true, unstable_moduleResolution: { type: "commonJS", rootDir: fileURLToPath(new URL("../..", import.meta.url)) } }), react()] });\n',
  );
  run("pnpm", ["install", "--ignore-scripts"], fixtureRoot);
  run("pnpm", ["--filter", "@fixture/theme", "build"], fixtureRoot);
  run("pnpm", ["--filter", "@fixture/ui-web", "typecheck"], fixtureRoot);
  run("pnpm", ["--filter", "@fixture/ui-native", "typecheck"], fixtureRoot);
  run("pnpm", ["--filter", "@fixture/web", "build"], fixtureRoot);

  const themeModulePath = join(themeRoot, "dist/index.js");
  const cssPath = join(themeRoot, "styles/generated.css");
  if (!existsSync(themeModulePath) || !existsSync(cssPath)) {
    throw new Error(
      "Packed fixture did not produce both native and web outputs.",
    );
  }

  const themeModule = await import(
    `${pathToFileURL(themeModulePath).href}?smoke=1`
  );
  if (!themeModule.lightTheme || !themeModule.darkTheme) {
    throw new Error("Packed fixture is missing generated theme exports.");
  }

  const generatedAdapterFiles = [
    join(fixtureRoot, "packages/ui-web/src/Button.tsx"),
    join(fixtureRoot, "packages/ui-native/src/Button.tsx"),
    join(fixtureRoot, "packages/theme/src/generated/tokens.stylex.ts"),
  ];
  if (generatedAdapterFiles.some((filename) => !existsSync(filename))) {
    throw new Error("Packed fixture is missing generated adapter source.");
  }

  const cssFixtureRoot = join(temporaryRoot, "fixture-css");
  run(
    process.execPath,
    [
      initializer,
      "init",
      "--name",
      "CSS Fixture",
      "--scope",
      "@css-fixture",
      "--prefix",
      "cf",
      "--cwd",
      cssFixtureRoot,
      "--template",
      "none",
      "--brand",
      "#FF3131",
      "--web",
      "css-modules",
      "--native",
      "none",
      "--yes",
    ],
    temporaryRoot,
  );
  const cssThemePackagePath = join(
    cssFixtureRoot,
    "packages/theme/package.json",
  );
  const cssThemePackage = JSON.parse(
    await readFile(cssThemePackagePath, "utf8"),
  );
  cssThemePackage.devDependencies["@assalabs/design-system-tools"] =
    `file:${toolsArchive}`;
  await writeFile(
    cssThemePackagePath,
    `${JSON.stringify(cssThemePackage, null, 2)}\n`,
  );
  await writeFile(
    join(cssFixtureRoot, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        packageManager: "pnpm@10.13.1",
        devDependencies: {
          "@types/react": "~19.2.2",
          react: "19.2.8",
          "react-dom": "19.2.8",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(cssFixtureRoot, "pnpm-workspace.yaml"),
    'packages:\n  - "packages/*"\n',
  );
  run("pnpm", ["install", "--ignore-scripts"], cssFixtureRoot);
  run("pnpm", ["--filter", "@css-fixture/theme", "build"], cssFixtureRoot);
  run("pnpm", ["--filter", "@css-fixture/ui-web", "typecheck"], cssFixtureRoot);

  console.log(
    "Packed design-system scaffold passed StyleX and CSS Modules install/build verification.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
