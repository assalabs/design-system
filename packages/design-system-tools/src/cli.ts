#!/usr/bin/env node

import { relative, resolve } from "node:path";
import chokidar from "chokidar";
import {
  findStaleOutputs,
  generateDesignSystem,
  writeGeneratedOutputs,
} from "./build.js";
import { loadDesignSystemConfig } from "./config.js";
import type { LoadedDesignSystemConfig } from "./types.js";

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

async function buildLoaded(loaded: LoadedDesignSystemConfig): Promise<void> {
  const outputs = await generateDesignSystem(loaded);
  await writeGeneratedOutputs(loaded, outputs);
  console.log(`Built ${outputs.length} design-system outputs.`);
}

async function build(configArgument?: string): Promise<void> {
  const loaded = await loadDesignSystemConfig(configArgument);
  await buildLoaded(loaded);
}

function tokensDirectory(loaded: LoadedDesignSystemConfig): string {
  return resolve(loaded.rootDirectory, loaded.config.source, "..");
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
  let loaded = await loadDesignSystemConfig(configArgument);
  let watchedTokensDirectory = tokensDirectory(loaded);
  let rebuilding = false;
  let queued = false;
  let queuedConfigReload = false;
  let tokenWatcher: ReturnType<typeof chokidar.watch>;

  const createTokenWatcher = async (
    directory: string,
  ): Promise<ReturnType<typeof chokidar.watch>> => {
    const nextWatcher = chokidar.watch(directory, {
      ignoreInitial: true,
      ignored: (path, stats) =>
        Boolean(stats?.isFile() && !path.endsWith(".json")),
    });
    nextWatcher.on("all", (event, path) => {
      if (
        ["add", "change", "unlink"].includes(event) &&
        path.endsWith(".json")
      ) {
        void rebuild();
      }
    });
    await new Promise<void>((resolveReady) => {
      nextWatcher.once("ready", resolveReady);
    });
    return nextWatcher;
  };

  const rebuild = async (reloadConfig = false): Promise<void> => {
    if (rebuilding) {
      queued = true;
      queuedConfigReload ||= reloadConfig;
      return;
    }

    rebuilding = true;
    try {
      if (reloadConfig) {
        const nextLoaded = await loadDesignSystemConfig(configArgument);
        const nextTokensDirectory = tokensDirectory(nextLoaded);

        if (nextTokensDirectory !== watchedTokensDirectory) {
          const nextWatcher = await createTokenWatcher(nextTokensDirectory);
          await tokenWatcher.close();
          tokenWatcher = nextWatcher;
          watchedTokensDirectory = nextTokensDirectory;
          console.log(
            `Watching ${relative(process.cwd(), tokensDirectory(nextLoaded)) || "."} for token changes.`,
          );
        }
        loaded = nextLoaded;
      }

      await buildLoaded(loaded);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    } finally {
      rebuilding = false;
      if (queued) {
        const reloadQueuedConfig = queuedConfigReload;
        queued = false;
        queuedConfigReload = false;
        await rebuild(reloadQueuedConfig);
      }
    }
  };

  await rebuild();
  tokenWatcher = await createTokenWatcher(watchedTokensDirectory);
  const configPath = loaded.configPath;
  const configWatcher = chokidar.watch(configPath, { ignoreInitial: true });
  configWatcher.on("all", (event, path) => {
    if (["add", "change", "unlink"].includes(event)) {
      void rebuild(resolve(path) === configPath);
    }
  });
  await new Promise<void>((resolveReady) => {
    configWatcher.once("ready", resolveReady);
  });

  console.log(
    `Watching ${relative(process.cwd(), tokensDirectory(loaded)) || "."} for token changes.`,
  );
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
