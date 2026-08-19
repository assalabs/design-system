# Contributing

## Development

Use Node.js 24 and pnpm 10.13.1 for the same environment as CI.

```bash
pnpm install --frozen-lockfile
pnpm check
```

Keep reusable tooling independent from product themes and applications. Add or
update a Changeset for every user-visible package change.

## Generated-code contract

- DTCG JSON is the canonical token source.
- Generated CSS and TypeScript are deterministic and checked for drift.
- Adapter templates are application-owned source, not a universal runtime UI
  package.
- Web behavior may use Base UI. Native components must use native accessibility
  and interaction primitives.
- New adapter combinations need a clean-room generation test.

## Pull requests

Keep changes focused, explain user-visible behavior, and include the commands
used to validate the change. CI must pass before merge.
