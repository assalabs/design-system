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
