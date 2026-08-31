#!/usr/bin/env node

import { cancel, intro, isCancel, outro, select, text } from "@clack/prompts";
import { basename, resolve } from "node:path";
import { scaffoldDesignSystem } from "./scaffold.js";
import type {
  Bundler,
  NativeAdapter,
  ScaffoldOptions,
  Template,
  WebAdapter,
} from "./types.js";

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function valueAfter(args: string[], flag: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayName(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function defaultPrefix(value: string): string {
  const words = slugify(value).split("-").filter(Boolean);
  return (
    words.length > 1
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? "ds").slice(0, 2)
  ).slice(0, 4);
}

function assertHex(flag: string, value: string): string {
  if (!HEX_PATTERN.test(value)) {
    throw new Error(`${flag} must be #RRGGBB (got "${value}")`);
  }
  return value;
}

function assertNeutral(value: string): string {
  if (value === "gray") {
    return value;
  }
  return assertHex("--neutral", value);
}

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Design-system setup cancelled.");
    process.exit(0);
  }
  return value;
}

function printHelp(): void {
  console.log(`create-assalabs-design-system

Usage:
  create-assalabs-design-system init
  create-assalabs-design-system init --name Acme --scope @acme --prefix ac \\
    --template expo --brand "#FF3131" --yes

Options:
  --cwd path        Target monorepo (default: current directory)
  --name name       Design-system display name
  --scope scope     Package scope, such as @acme
  --prefix prefix   CSS custom-property prefix
  --template name   expo, web, or none (default: none)
  --bundler name    rsbuild or vite (default: rsbuild; --template web only)
  --brand hex       Brand seed colour, such as "#FF3131" (quote the #)
  --neutral value   Neutral seed hex or "gray" (default: derived from brand hue)
  --accent hex      Accent seed hex (default: brand hue rotated by 150 degrees)
  --web adapter     stylex, css-modules, or none
  --native adapter  unistyles or none
  --yes             Accept inferred names and adapters; requires --brand
`);
}

async function parseOptions(args: string[]): Promise<ScaffoldOptions> {
  const cwd = resolve(valueAfter(args, "--cwd") ?? process.cwd());
  const directoryName = basename(cwd);
  const inferredSlug = slugify(directoryName) || "design-system";
  const defaults = {
    name: displayName(directoryName) || "Design System",
    scope: `@${inferredSlug}`,
    prefix: defaultPrefix(directoryName),
    template: "none" as const,
    bundler: "rsbuild" as const,
    web: "stylex" as const,
    native: "unistyles" as const,
  };
  const supplied = {
    name: valueAfter(args, "--name"),
    scope: valueAfter(args, "--scope"),
    prefix: valueAfter(args, "--prefix"),
    template: valueAfter(args, "--template") as Template | undefined,
    bundler: valueAfter(args, "--bundler") as Bundler | undefined,
    brand: valueAfter(args, "--brand"),
    neutral: valueAfter(args, "--neutral"),
    accent: valueAfter(args, "--accent"),
    web: valueAfter(args, "--web") as WebAdapter | undefined,
    native: valueAfter(args, "--native") as NativeAdapter | undefined,
  };
  if (hasFlag(args, "--yes")) {
    if (!supplied.brand) {
      throw new Error("--brand is required with --yes");
    }
    return {
      cwd,
      name: supplied.name ?? defaults.name,
      scope: supplied.scope ?? defaults.scope,
      prefix: supplied.prefix ?? defaults.prefix,
      template: supplied.template ?? defaults.template,
      bundler: supplied.bundler ?? defaults.bundler,
      brand: assertHex("--brand", supplied.brand),
      neutral: supplied.neutral ? assertNeutral(supplied.neutral) : undefined,
      accent: supplied.accent
        ? assertHex("--accent", supplied.accent)
        : undefined,
      web: supplied.web ?? defaults.web,
      native: supplied.native ?? defaults.native,
    };
  }

  intro("Create a cross-platform design system");
  const name =
    supplied.name ??
    unwrap(
      await text({
        message: "Design-system name",
        defaultValue: defaults.name,
        placeholder: defaults.name,
      }),
    );
  const projectSlug = slugify(name) || inferredSlug;
  const scope =
    supplied.scope ??
    unwrap(
      await text({
        message: "Package scope",
        defaultValue: `@${projectSlug}`,
        placeholder: `@${projectSlug}`,
      }),
    );
  const prefix =
    supplied.prefix ??
    unwrap(
      await text({
        message: "CSS custom-property prefix",
        defaultValue: defaultPrefix(projectSlug),
        placeholder: defaultPrefix(projectSlug),
      }),
    );
  const template =
    supplied.template ??
    unwrap(
      await select<Template>({
        message: "App template",
        initialValue: defaults.template,
        options: [
          { value: "none", label: "None", hint: "theme package only" },
          { value: "expo", label: "Expo app" },
          { value: "web", label: "Web app" },
        ],
      }),
    );
  // `--bundler` only selects between the two web templates, so it is asked
  // right after the template and only when "web" was chosen. Without this
  // prompt the flag is reachable from the command line alone and an
  // interactive "web" run always silently produces the rsbuild template.
  const bundler =
    supplied.bundler ??
    (template === "web"
      ? unwrap(
          await select<Bundler>({
            message: "Web bundler",
            initialValue: defaults.bundler,
            options: [
              { value: "rsbuild", label: "Rsbuild", hint: "recommended" },
              { value: "vite", label: "Vite" },
            ],
          }),
        )
      : defaults.bundler);
  const brand = supplied.brand
    ? assertHex("--brand", supplied.brand)
    : unwrap(
        await text({
          message: "Brand seed colour",
          placeholder: "#FF3131",
          validate: (value) =>
            HEX_PATTERN.test(value ?? "")
              ? undefined
              : "Enter a hex colour such as #FF3131.",
        }),
      );
  const neutralAnswer =
    supplied.neutral ??
    unwrap(
      await text({
        message: 'Neutral seed (hex or "gray", blank to derive from brand)',
        defaultValue: "",
        placeholder: "derived from brand hue",
        validate: (value) =>
          !value || value === "gray" || HEX_PATTERN.test(value)
            ? undefined
            : 'Enter a hex colour, "gray", or leave blank.',
      }),
    );
  const accentAnswer =
    supplied.accent ??
    unwrap(
      await text({
        message: "Accent seed (hex, blank to derive from brand)",
        defaultValue: "",
        placeholder: "derived from brand hue",
        validate: (value) =>
          !value || HEX_PATTERN.test(value)
            ? undefined
            : "Enter a hex colour such as #31FFB0.",
      }),
    );
  const web =
    supplied.web ??
    unwrap(
      await select<WebAdapter>({
        message: "Web styling adapter",
        initialValue: defaults.web,
        options: [
          { value: "stylex", label: "StyleX", hint: "recommended" },
          { value: "css-modules", label: "CSS Modules" },
          { value: "none", label: "None" },
        ],
      }),
    );
  const native =
    supplied.native ??
    unwrap(
      await select<NativeAdapter>({
        message: "React Native styling adapter",
        initialValue: defaults.native,
        options: [
          { value: "unistyles", label: "Unistyles", hint: "recommended" },
          { value: "none", label: "None" },
        ],
      }),
    );

  return {
    cwd,
    name,
    scope,
    prefix,
    template,
    bundler,
    brand,
    neutral: neutralAnswer ? assertNeutral(neutralAnswer) : undefined,
    accent: accentAnswer ? assertHex("--accent", accentAnswer) : undefined,
    web,
    native,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "init") {
    printHelp();
    if (args[0] && !["--help", "-h"].includes(args[0])) {
      process.exitCode = 1;
    }
    return;
  }

  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return;
  }

  const options = await parseOptions(args.slice(1));
  const result = await scaffoldDesignSystem(options);
  for (const filename of result.files) {
    console.log(`CREATE ${filename}`);
  }
  for (const filename of result.skipped) {
    console.log(`SKIP   ${filename} (already exists, kept yours)`);
  }

  outro(`Created ${options.name} in ${result.directories.length} packages.`);
  console.log(
    "Install workspace dependencies, then follow the generated package READMEs.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
