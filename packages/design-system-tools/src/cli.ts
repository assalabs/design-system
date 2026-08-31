#!/usr/bin/env node

import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import chokidar from "chokidar";
import {
  findStaleOutputs,
  generateDesignSystem,
  writeGeneratedOutputs,
} from "./build.js";
import { loadDesignSystemConfig } from "./config.js";
import { PaletteError, type PaletteInput } from "./palette/derive.js";
import { generatePalette } from "./palette/index.js";
import type { GeneratedOutput, LoadedDesignSystemConfig } from "./types.js";

const PALETTE_FILENAMES = [
  "primitives/colors.tokens.json",
  "semantic/light.tokens.json",
  "semantic/dark.tokens.json",
] as const;

const DEBUG_FLAG = "--debug";

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * Writes one failure to stderr.
 *
 * The default is a single line, because the errors this tool raises itself are
 * already written for a human. Errors it only PROPAGATES are not: the config is
 * imported as real ESM, so a `TypeError` inside it reaches the user as a bare
 * "Cannot read properties of undefined". `--debug` prints the stack (and the
 * `cause` chain, which carries the original error when a message was
 * re-wrapped) so those stay diagnosable without noisying up the curated ones.
 */
function reportError(error: unknown): void {
  if (!(error instanceof Error)) {
    console.error(error);
    return;
  }

  if (!process.argv.includes(DEBUG_FLAG)) {
    console.error(error.message);
    return;
  }

  console.error(error.stack ?? error.message);

  for (let cause = error.cause; cause instanceof Error; cause = cause.cause) {
    console.error(`Caused by: ${cause.stack ?? cause.message}`);
  }
}

function printHelp(): void {
  console.log(`assalabs-ds

Usage:
  assalabs-ds tokens build [--config path]
  assalabs-ds tokens check [--config path]
  assalabs-ds tokens watch [--config path]
  assalabs-ds palette --brand "<#RRGGBB>" [options]

Options:
  --config <path>   Config path (default design-system.config.mjs).
  --debug           Print the stack trace instead of only the message.

Palette derivation: neutral keeps the brand hue at low chroma, accent uses the
brand hue rotated by 150 degrees, and status ramps use fixed hues.
Run "assalabs-ds palette --help" for the full palette options.
`);
}

function printPaletteHelp(): void {
  console.log(`assalabs-ds palette

Usage:
  assalabs-ds palette --brand "<#RRGGBB>" [--neutral "<#RRGGBB>"|gray]
                      [--accent "<#RRGGBB>"] [--force] [--json] [--config path]

Generates primitives/colors.tokens.json, semantic/light.tokens.json and
semantic/dark.tokens.json in the token directory of the design system config.

Options:
  --brand    "<#RRGGBB>"        Required seed color for the brand ramp.
  --neutral  "<#RRGGBB>"|gray   Neutral seed. Omit to derive, "gray" for achromatic.
  --accent   "<#RRGGBB>"        Accent seed. Omit to derive.
  --force                       Overwrite existing token files.
  --json                        Print the palette to stdout and write nothing.
  --config   <path>             Config path (default design-system.config.mjs).
  --debug                       Print the stack trace instead of only the message.

Quote seed colors: an unquoted # starts a comment in POSIX shells, so
--brand #FF3131 arrives with no value at all.

Derivation: neutral = brand hue at low chroma, accent = brand hue + 150 degrees,
status = fixed hues (success 145, warning 80, danger 25, info 250).
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
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 10,
      },
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
      reportError(error);
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
  const configWatcher = chokidar.watch(configPath, {
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 10,
    },
    ignoreInitial: true,
  });
  configWatcher.on("all", (event, path) => {
    if (["add", "change"].includes(event)) {
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

function paletteOutputs(
  loaded: LoadedDesignSystemConfig,
  files: Record<(typeof PALETTE_FILENAMES)[number], string>,
): GeneratedOutput[] {
  const directory = tokensDirectory(loaded);
  return PALETTE_FILENAMES.map((name) => ({
    filename: relative(loaded.rootDirectory, resolve(directory, name)),
    contents: files[name],
  }));
}

async function palette(args: string[], configArgument?: string): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printPaletteHelp();
    return;
  }

  const brand = readFlag(args, "--brand");

  if (brand === undefined) {
    throw new PaletteError(
      '--brand is required (for example --brand "#FF3131")',
    );
  }

  const input: PaletteInput = { brand };
  const neutral = readFlag(args, "--neutral");
  const accent = readFlag(args, "--accent");

  if (neutral !== undefined) {
    input.neutral = neutral;
  }

  if (accent !== undefined) {
    input.accent = accent;
  }

  const result = generatePalette(input);

  if (args.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          primitives: result.primitives,
          anchors: result.anchors,
          semantic: result.semantic,
          report: result.report,
        },
        null,
        2,
      ),
    );
    return;
  }

  const loaded = await loadDesignSystemConfig(configArgument);
  const outputs = paletteOutputs(loaded, result.files);

  if (!args.includes("--force")) {
    // Report every file that would be clobbered, not just the first one, so a
    // single run tells the user the full cost of adding --force.
    const existing = outputs
      .map((output) => resolve(loaded.rootDirectory, output.filename))
      .filter((destination) => existsSync(destination))
      .map(
        (destination) => relative(process.cwd(), destination) || destination,
      );

    if (existing.length > 0) {
      throw new PaletteError(
        `Refusing to overwrite ${existing.join(", ")} (use --force)`,
      );
    }
  }

  await writeGeneratedOutputs(loaded, outputs);
  console.log(`Wrote ${outputs.length} palette token files.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configArgument = readFlag(args, "--config");
  const [command, subcommand] = args.filter(
    (argument, index) =>
      argument !== "--config" &&
      argument !== DEBUG_FLAG &&
      args[index - 1] !== "--config",
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

  if (command === "palette") {
    await palette(args, configArgument);
    return;
  }

  printHelp();
  if (command && command !== "--help" && command !== "-h") {
    process.exitCode = 1;
  }
}

// Every failure exits 1 through here. Without --debug it is one stderr line:
// that is the finished contract for the errors this tool writes itself
// (PaletteError, config validation, stale outputs), and a lossy summary for the
// ones it merely propagates from user-authored config code. --debug prints the
// stack instead; see reportError.
main().catch((error: unknown) => {
  reportError(error);
  process.exitCode = 1;
});
