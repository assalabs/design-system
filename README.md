# Assa Labs Design System

Generate validated design tokens and platform-owned UI for web and React
Native, from one brand colour.

> Early preview. The token compiler is published at `0.1.x`; the palette
> generator, the StyleX and Unistyles adapters, and the app templates described
> below are available in this repository and are planned for the next minor
> release.

## Quick start

```bash
pnpm dlx @assalabs/create-design-system@latest init
```

The prompts cover the name, scope, prefix, app template, seed colours, and
styling adapters; the web bundler is asked only when you pick the web template.
For repeatable automation:

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

`--template expo|web|none` chooses the scaffold, `--bundler rsbuild|vite`
picks between the two web templates, and `--brand` seeds the palette.
`--neutral` and `--accent` override their derivations. See the
[initializer README](./packages/create-design-system/README.md) for the full
option list.

## What it creates

`--template none` adds up to three source-owned packages to an existing pnpm
workspace:

- `packages/theme`: DTCG tokens, generated CSS variables, typed native themes,
  semantic validation, contrast checks, and drift detection.
- `packages/ui-web`: Button, TextField, Checkbox, and Switch components built on
  Base UI, using either StyleX or CSS Modules.
- `packages/ui-native`: matching React Native primitives styled with Unistyles.

`--template expo` and `--template web` instead scaffold a whole new workspace —
root manifest, `pnpm-workspace.yaml`, `turbo.json`, dotfiles, a CI workflow, and
an app wired to the theme. Because they own the workspace root, they are for new
repos; use `--template none` inside an existing monorepo.

Base UI remains a web behavior layer. Native components share tokens and
product semantics, but use React Native interaction and accessibility APIs.

The initializer refuses to overwrite any target package. It preflights the
complete selection and removes directories created by a failed run.

## The palette

One seed colour produces both themes. Working in OKLCH, `neutral` keeps the
**brand hue at low chroma** so greys are tinted rather than dead, `accent` is the
**brand hue rotated by 150°**, and the four status ramps use **fixed hues**
(success 145, warning 80, danger 25, info 250). Every ramp runs `50`–`950` with
the seed preserved exactly at whichever step's lightness it matches.

Semantic roles are then chosen by contrast rather than convention: each role
walks a candidate list until every declared pair holds, and `brand.default` and
`fg.onBrand` are resolved together. The scaffolded theme's `contrastPairs` are
that same table, so `check:theme` re-asserts what the generator promised.

The rules, the edge cases (achromatic and extreme seeds), and the adapter output
contracts are documented in the
[tools README](./packages/design-system-tools/README.md).

## Upgrading a scaffolded repo

The generated theme caret-pins the tooling, so scaffolded repos upgrade in
place:

```bash
pnpm up @assalabs/design-system-tools && pnpm build:theme && pnpm check:theme
```

## Packages

### `@assalabs/design-system-tools`

Build-time tooling around a pinned Terrazzo parser. It turns DTCG JSON into
static CSS and plain TypeScript themes, derives palettes, emits StyleX and
Unistyles adapter output, then validates semantic tokens, theme parity, declared
contrast pairs, and committed-output drift.

### `@assalabs/create-design-system`

Interactive initializer and source template registry. Generated UI belongs to
the consuming project; applications do not take a runtime dependency on an
Assa Labs component package.

## Repository development

Requires Node.js 22 or newer; CI runs Node 22 and pnpm 10.13.1.

```bash
pnpm install
pnpm check
```

`pnpm check` formats, lints, typechecks, tests, builds, packs both published
packages, installs the packed initializer, and builds a clean generated theme.
`pnpm test:template <expo|web-rsbuild|web-vite|none>` scaffolds a template from
the packed artifacts and builds it for real; CI runs that matrix as its own job.

See [the architecture](./packages/design-system-tools/ARCHITECTURE.md) and
[contribution guide](./CONTRIBUTING.md) for the project boundaries.

## License

MIT © Assa Labs.
