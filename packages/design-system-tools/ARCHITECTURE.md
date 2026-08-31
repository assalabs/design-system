# Design-system architecture

## Decision

DTCG 2025.10 JSON is the canonical design-system source. A pinned Terrazzo
toolchain parses and resolves it. This project owns the semantic contract,
validation, native output plugin, workflow commands, and small initializer—not
a custom token parser or application runtime.

```text
DTCG resolver
  -> Terrazzo parser and lint
  -> semantic, parity, and contrast validation
  -> static CSS for web
  -> plain TypeScript objects for native
  -> drift comparison
```

## Package boundaries

- `@assalabs/design-system-tools` is public build-time tooling.
- `@assalabs/create-design-system` is a public initializer that creates the
  standard theme and selected platform-owned UI packages in a consumer
  monorepo.
- Generated theme and UI packages are private consumer source. Brand tokens,
  fonts, application behavior, and product-specific components stay outside
  this repository.

Reusable tooling must never import from an Assa Labs product theme,
application, or product package.

## Adapters

StyleX and Unistyles output are **post-Terrazzo functions**, not Terrazzo
plugins. Both run against the `resolvedThemes` map the build already computed in
order to validate parity and contrast, so an adapter is a pure
`(config, resolvedThemes) -> GeneratedOutput` call with no plugin API surface
and a trivial on/off gate in the config. Adding an adapter costs one function
and one `outputs.*` key.

Both adapters require `themes` to be exactly `["light", "dark"]`, because both
emit a light value plus a dark override and neither has a shape for a third
appearance.

The StyleX adapter emits a `var()` reference into the generated stylesheet for
every theme-dependent token rather than an override object.
`stylex.defineVars` cannot express the override: StyleX 0.19 reads every
non-`default` key of a value object as an at-rule, so a selector key such as
`:root[data-theme="dark"]` lowers to a dead `[data-theme=dark] :root`
descendant rule, and only `prefers-color-scheme` ever applied. Aliasing the
stylesheet keeps all three states, needs no class on `<html>`, and leaves
`data-theme` the single thing to assert. That is why `outputs.stylex` requires
`outputs.css`.

The Unistyles adapter emits one file, with the `declare module` augmentation
inlined rather than split into a sibling `unistyles.d.ts`. TypeScript drops a
declaration file shadowed by a same-named `.ts` from wildcard-`include`
programs, and module resolution prefers the `.ts`, so a sibling declaration
would silently never load. Both adapter outputs stay out of the theme's bundler
entries and ship as source: the StyleX file must reach the consumer's compiler
unbundled, and the augmentation only applies when TypeScript loads the source.

## Semantic roles and the compat alias layer

The palette generator owns the semantic contract: role names are `bg.*`, `fg.*`,
`border.*`, `brand.*`, `accent.*`, `status.*`, and each role's value is chosen by
walking a candidate list until every declared contrast pair holds.

On top of those, `emitSemantic` writes a small layer of aliases-of-aliases —
`color.surface.*`, `color.text.*`, `color.action.primary.*`,
`color.feedback.error.*`, `color.focus.ring` — pointing back at the roles. It
exists so the UI templates and committed examples, written against the older
naming, keep working unchanged across the rename. It is roughly fifteen extra
tokens and no extra source of truth: every alias resolves to a role, and a role
resolves to a primitive.

## Version pins

`@terrazzo/parser` and `@terrazzo/plugin-css` are pinned to exactly `2.5.0`, not
a caret range. Generated output is byte-compared by `tokens check`, so a patch
bump to the parser is a potential diff in every consumer's committed files. The
pin makes that upgrade an explicit, reviewable change with its own re-baseline
rather than something a lockfile refresh can do silently.

`@terrazzo/token-tools` is pinned separately at `2.7.1`. It contributes no
generated output of its own; the adapters use its `makeCSSVar` so a `var()`
reference is derived by the same helper the CSS plugin declares with, and cannot
drift from the declaration.

## Generation contract

- Canonical tokens and generated source artifacts are committed.
- `dist/` is rebuilt and is not committed.
- Generated files contain a do-not-edit header.
- `tokens:check` generates in memory and byte-compares outputs without modifying
  the checkout.
- CSS variables are namespaced and themes use explicit `data-theme` selectors.
- Native colors are limited to sRGB and dimensions to pixels. Unsupported values
  fail instead of producing invalid React Native output.

## Current scope

The public foundation includes tokens, CSS/native generation, validation,
drift checks, an interactive initializer, focused web/native consumers, Base UI
web components, and Unistyles native components. Figma synchronization,
multi-brand contexts, and complex overlay/navigation components remain deferred
until real consumers define their contracts.

## Releases

Changesets versions `@assalabs/design-system-tools` and
`@assalabs/create-design-system` together and publishes them as public npm
packages. The generated theme depends on the matching released tooling version
instead of a workspace-only range. Generated themes, UI packages, and examples
remain private.
