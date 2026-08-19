# @assalabs/design-system-tools

Build-time tooling that turns DTCG design tokens into static CSS and plain
TypeScript themes for web and React Native.

The package wraps a pinned Terrazzo toolchain and adds semantic-contract,
theme-parity, contrast, and generated-output drift checks.

```bash
pnpm add --save-dev @assalabs/design-system-tools

assalabs-ds tokens build
assalabs-ds tokens check
assalabs-ds tokens watch
```

Applications do not depend on this package at runtime. They consume only the
generated outputs published by their theme package.
