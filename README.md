# Kivo

AI support chat widget for any website. pnpm monorepo, run with Turborepo.

| Path              | What                                                       |
| ----------------- | ---------------------------------------------------------- |
| `apps/web`        | Next.js app (App Router, Tailwind)                         |
| `apps/widget`     | Vanilla TS loader, bundled to `apps/widget/dist/widget.js` |
| `packages/shared` | Shared contract: `APP_NAME`, types, API shapes             |
| `packages/db`     | Supabase types and test helpers (Phase 1)                  |

## Install

Needs Node 24 (`.nvmrc`) and pnpm 10 (`packageManager` in `package.json`; `corepack enable` picks it up).

```sh
pnpm install
cp .env.example .env.local   # fill in values; never commit them
```

## Run

```sh
pnpm dev   # http://localhost:3000, and rebuilds the widget on change
```

## Check

All must pass before a PR:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm format` runs Prettier.

Product docs: `docs/project.md` and `docs/plan.md`.
