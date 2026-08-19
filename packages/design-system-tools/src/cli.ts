#!/usr/bin/env node

import { relative, resolve } from "node:path";
import chokidar from "chokidar";
import {
  findStaleOutputs,
  generateDesignSystem,
  writeGeneratedOutputs,
} from "./build.js";
import { loadDesignSystemConfig } from "./config.js";

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function printHelp(): void {
  console.log(`assalabs-ds

Usage:
  assalabs-ds tokens build [--config path]
  assalabs-ds tokens check [--config path]
  assalabs-ds tokens watch [--config path]
`);
}

async function build(configArgument?: string): Promise<void> {
  const loaded = await loadDesignSystemConfig(configArgument);
  const outputs = await generateDesignSystem(loaded);
  await writeGeneratedOutputs(loaded, outputs);
  console.log(`Built ${outputs.length} design-system outputs.`);
}

async function check(configArgument?: string): Promise<void> {
  const loaded = await loadDesignSystemConfig(configArgument);
  const outputs = await generateDesignSystem(loaded);
  const stale = await findStaleOutputs(loaded, outputs);

  if (stale.length > 0) {
    throw new Error(
      `Generated outputs are stale:\n${stale.map((path) => `  - ${path}`).join("\n")}\nRun assalabs-ds tokens build.`,
    );
  }

  console.log("Tokens and generated outputs are valid and current.");
}

async function watch(configArgument?: string): Promise<void> {
  const loaded = await loadDesignSystemConfig(configArgument);
  const tokensDirectory = resolve(
    loaded.rootDirectory,
    loaded.config.source,
    "..",
  );
  let rebuilding = false;
  let queued = false;

  const rebuild = async (): Promise<void> => {
    if (rebuilding) {
      queued = true;
      return;
    }

    rebuilding = true;
    try {
      await build(configArgument);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    } finally {
      rebuilding = false;
      if (queued) {
        queued = false;
        await rebuild();
      }
    }
  };

  await rebuild();
  const watcher = chokidar.watch([
    `${tokensDirectory}/**/*.json`,
    loaded.configPath,
  ]);
  watcher.on("change", rebuild);
  watcher.on("add", rebuild);
  watcher.on("unlink", rebuild);

  console.log(
    `Watching ${relative(process.cwd(), tokensDirectory) || "."} for token changes.`,
  );
  await new Promise<void>(() => undefined);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configArgument = readFlag(args, "--config");
  const [command, subcommand] = args.filter(
    (argument, index) =>
      argument !== "--config" && args[index - 1] !== "--config",
  );

  if (command === "tokens" && subcommand === "build") {
    await build(configArgument);
    return;
  }

  if (command === "tokens" && subcommand === "check") {
    await check(configArgument);
    return;
  }

  if (command === "tokens" && subcommand === "watch") {
    await watch(configArgument);
    return;
  }

  printHelp();
  if (command && command !== "--help" && command !== "-h") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
