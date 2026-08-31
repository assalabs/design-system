# @assalabs/create-design-system

Interactive initializer for a portable design system: DTCG tokens, static web
CSS, plain React Native themes, and source-owned UI adapters. One brand colour
in, a contrast-checked palette and a wired-up workspace out.

Requires Node.js 22 or newer.

## Quick start

```bash
pnpm dlx @assalabs/create-design-system@latest init
```

The prompts cover the name, the package scope, the CSS custom-property prefix,
the app template, the seed colours, and the styling adapters. The web bundler is
asked only when you pick the web template.

Non-interactive, for scripts and CI:

```bash
pnpm dlx @assalabs/create-design-system@latest init \
  --name Acme \
  --scope @acme \
  --prefix ac \
  --template web \
  --bundler vite \
  --brand '#FF3131' \
  --yes
```

## Options

| Flag                 | Values                                    | Default                         |
| -------------------- | ----------------------------------------- | ------------------------------- |
| `--cwd <path>`       | target directory                          | current directory               |
| `--name <name>`      | design-system display name                | derived from the directory      |
| `--scope <scope>`    | npm scope, such as `@acme`                | derived from the directory      |
| `--prefix <prefix>`  | CSS custom-property prefix                | derived from the name           |
| `--template <name>`  | `expo`, `web`, `none`                     | `none`                          |
| `--bundler <name>`   | `rsbuild`, `vite` — `--template web` only | `rsbuild`                       |
| `--brand <hex>`      | `#RRGGBB` brand seed                      | prompted; required with `--yes` |
| `--neutral <value>`  | `#RRGGBB` or `gray`                       | derived from the brand hue      |
| `--accent <hex>`     | `#RRGGBB`                                 | brand hue rotated by 150°       |
| `--web <adapter>`    | `stylex`, `css-modules`, `none`           | `stylex`                        |
| `--native <adapter>` | `unistyles`, `none`                       | `unistyles`                     |
| `--yes`              | skip all prompts; requires `--brand`      | —                               |

Seed derivation, the contrast rules the generated palette satisfies, and the
achromatic/extreme-seed edge cases are documented in
[`@assalabs/design-system-tools`](https://www.npmjs.com/package/@assalabs/design-system-tools).

## What it creates

`packages/theme` is always created: DTCG tokens seeded from your brand colour,
`design-system.config.mjs`, generated CSS variables, typed native themes,
semantic validation, contrast checks, and drift detection. Its
`color.brand.primary` alias is pointed at the ramp step your seed actually
anchored on, not a hardcoded `500`.

`--template` decides what surrounds it:

| Template | Adds                           | Styling                                                              |
| -------- | ------------------------------ | -------------------------------------------------------------------- |
| `none`   | nothing but the theme          | `--web` / `--native` pick `packages/ui-web` and `packages/ui-native` |
| `expo`   | workspace root + `apps/mobile` | Unistyles                                                            |
| `web`    | workspace root + `apps/web`    | StyleX, via Rsbuild or Vite                                          |

An app template owns the workspace root: root `package.json`,
`pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.npmrc`, and a
`theme-check.yml` CI workflow. That is why templates are for **new** repos —
use `--template none` inside an existing monorepo.

`--web` and `--native` apply to `--template none` only. The app templates ship
their own styling wiring, so the theme's adapter outputs follow the template
(`expo` means Unistyles, `web` means StyleX) rather than those flags.

The `expo` template pins Expo SDK 56 (`expo@56.0.21`, React Native `0.85.3`) —
deliberately one SDK behind the latest. `react-native-unistyles@3.3.0` is built
against RN 0.85.3 and ships `react-native-nitro-modules@0.36.1` as its matched
peer; Nitro is a compiled native module tied to RN's C++ ABI, so a newer RN
fails at native build time, long after a JS-only typecheck has gone green.

The initializer preflights every target and refuses to overwrite an existing
directory or an existing workspace-root file, removing anything a failed run
created.

## After scaffolding

An app template's workspace root exposes `build:theme` and `check:theme`:

```bash
pnpm install
pnpm build:theme   # generate CSS, native themes, and adapter outputs
pnpm check:theme   # re-assert token contracts, contrast pairs, and drift
```

With `--template none` there is no workspace root to add scripts to, so drive
the theme package directly — `pnpm --filter @acme/theme build` and
`pnpm --filter @acme/theme tokens:check`.

Then follow the generated package READMEs for app-specific compiler and native
setup.

## Upgrading the tooling

The generated theme pins `@assalabs/design-system-tools` to the initializer's
own version with a caret, so a scaffolded repo upgrades in place — there is no
need to re-run `init`. From an app template's workspace root:

```bash
pnpm up @assalabs/design-system-tools && pnpm build:theme && pnpm check:theme
```

`build:theme` regenerates every output with the new tooling and `check:theme`
fails if anything drifted, so the diff you review is the whole blast radius of
the upgrade.
