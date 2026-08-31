# {{DESIGN_SYSTEM_NAME}} theme

Cross-platform design tokens published as `{{PACKAGE_NAME}}`.

Edit the DTCG JSON files under `tokens/`, then run:

```bash
pnpm tokens:build
pnpm tokens:check
```

`tokens:build` regenerates every output declared in `design-system.config.mjs`.
`tokens:check` regenerates in memory and byte-compares, so it fails when a
generated file was hand-edited or left stale, when a required token is missing,
or when a declared contrast pair drops below its minimum.

## Consuming the theme

Web applications import `{{PACKAGE_NAME}}/css` once. The stylesheet declares the
`--{{prefix}}-*` custom properties on `:root`, with `[data-theme="light"]` and
`[data-theme="dark"]` blocks and a `prefers-color-scheme` fallback, so the app
follows the system by default and setting `data-theme` on `<html>` pins it.

React Native applications import plain theme objects from
`{{PACKAGE_NAME}}/native` and register them in an app-local styling adapter.

Where the StyleX and Unistyles adapters are enabled, this package also exports
`{{PACKAGE_NAME}}/tokens.stylex.ts` and `{{PACKAGE_NAME}}/unistyles`. Both are
shipped as **source**, not bundled: the StyleX file must reach your compiler
unbundled, and the Unistyles file carries a `declare module` augmentation that
only applies when TypeScript loads the source.

Note the two shapes differ. StyleX keys are flat and camelCase
(`colors.fgOnBrand`); native and Unistyles themes are nested by token path
(`theme.color.fg.onBrand`).

## Upgrading the tooling

`@assalabs/design-system-tools` is a caret-pinned dev dependency of this
package, so upgrades happen here rather than by re-scaffolding:

```bash
pnpm up @assalabs/design-system-tools && pnpm build:theme && pnpm check:theme
```

`build:theme` and `check:theme` are workspace-root scripts. Inside a repo that
has no such root, run `pnpm --filter {{PACKAGE_NAME}} build` and
`pnpm --filter {{PACKAGE_NAME}} tokens:check` instead.

Review the regenerated output as part of the upgrade: `check:theme` failing
after a build is the tooling telling you the new version changed something, and
the diff is exactly what changed.
