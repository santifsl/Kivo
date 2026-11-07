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

## Deploy and CI

- **Previews:** Vercel deploys a preview of every PR. Get its URL from the Vercel comment on the PR, never from the branch name.
- **Production:** builds from `main`, with automatic promotion off. Only the product owner promotes a build.
- **Vercel project:** Root Directory `apps/web`, Node 24.x (pinned by `engines` in `apps/web/package.json`).
- **Protected previews:** send the bypass header, using the secret from the `VERCEL_AUTOMATION_BYPASS_SECRET` variable:

  ```sh
  curl -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" <preview-url>/
  ```

  For browser tests, also send `x-vercel-set-bypass-cookie: true` on the first request.

- **CI:** `.github/workflows/ci.yml` (GitHub Actions) runs install, `pnpm typecheck`, `lint`, `test` and `build` on every PR and every push to `main`. A PR must be green before review.
- **Phase 0 verified:** 2026-11-07, preview on Vercel project `kivo` loads the home page.

Product docs: `docs/project.md` and `docs/plan.md`.
