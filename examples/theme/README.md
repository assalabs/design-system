# Example theme

Neutral cross-platform design tokens used by this repository's examples.

Edit the DTCG JSON files under `tokens/`, then run:

```bash
pnpm tokens:build
pnpm tokens:check
```

Web applications import `@assalabs/design-system-example-theme/css`. React
Native applications import plain theme objects from
`@assalabs/design-system-example-theme/native` and register them in
an app-local styling adapter.
