#!/usr/bin/env node

import { cancel, intro, isCancel, outro, select, text } from "@clack/prompts";
import { basename, resolve } from "node:path";
import { scaffoldDesignSystem } from "./scaffold.js";
import type { NativeAdapter, ScaffoldOptions, WebAdapter } from "./types.js";

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
    --web stylex --native unistyles

Options:
  --cwd path       Target monorepo (default: current directory)
  --name name      Design-system display name
  --scope scope    Package scope, such as @acme
  --prefix prefix  CSS custom-property prefix
  --web adapter    stylex, css-modules, or none
  --native adapter unistyles or none
  --yes            Accept inferred names and recommended adapters
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
    web: "stylex" as const,
    native: "unistyles" as const,
  };
  const supplied = {
    name: valueAfter(args, "--name"),
    scope: valueAfter(args, "--scope"),
    prefix: valueAfter(args, "--prefix"),
    web: valueAfter(args, "--web") as WebAdapter | undefined,
    native: valueAfter(args, "--native") as NativeAdapter | undefined,
  };

  if (hasFlag(args, "--yes")) {
    return {
      cwd,
      name: supplied.name ?? defaults.name,
      scope: supplied.scope ?? defaults.scope,
      prefix: supplied.prefix ?? defaults.prefix,
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

  return { cwd, name, scope, prefix, web, native };
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

  const options = await parseOptions(args.slice(1));
  const result = await scaffoldDesignSystem(options);
  for (const filename of result.files) {
    console.log(`CREATE ${filename}`);
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
