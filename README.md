# Assa Labs Design System

Generate validated design tokens and platform-owned UI for web and React
Native.

> Early preview. The token compiler is published at `0.1.x`; adapter and
> component generation is being prepared for the next release.

## What it creates

One command adds up to three source-owned packages to a pnpm workspace:

- `packages/theme`: DTCG tokens, generated CSS variables, typed native themes,
  semantic validation, contrast checks, and drift detection.
- `packages/ui-web`: Button, TextField, Checkbox, and Switch components built on
  Base UI, using either StyleX or CSS Modules.
- `packages/ui-native`: matching React Native primitives styled with Unistyles.

Base UI remains a web behavior layer. Native components share tokens and
product semantics, but use React Native interaction and accessibility APIs.

## Quick start

```bash
pnpm dlx @assalabs/create-design-system@latest init
```

For repeatable automation:

```bash
pnpm dlx @assalabs/create-design-system@latest init \
  --name Acme \
  --scope @acme \
  --prefix ac \
  --web stylex \
  --native unistyles
```

The initializer refuses to overwrite any target package. It preflights the
complete selection and removes directories created by a failed run.

## Packages

### `@assalabs/design-system-tools`

Build-time tooling around a pinned Terrazzo parser. It turns DTCG JSON into
static CSS and plain TypeScript themes, then validates semantic tokens, theme
parity, declared contrast pairs, and committed-output drift.

### `@assalabs/create-design-system`

Interactive initializer and source template registry. Generated UI belongs to
the consuming project; applications do not take a runtime dependency on an
Assa Labs component package.

## Repository development

Requires Node.js 22 or newer and pnpm 10.13.1.

```bash
pnpm install
pnpm check
```

`pnpm check` formats, lints, typechecks, tests, builds, packs both published
packages, installs the packed initializer, and builds a clean generated theme.

See [the architecture](./packages/design-system-tools/ARCHITECTURE.md) and
[contribution guide](./CONTRIBUTING.md) for the project boundaries.

## License

MIT © Assa Labs.
