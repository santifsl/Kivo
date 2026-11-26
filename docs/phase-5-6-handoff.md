# Kivo Phase 5–6 handoff to Claude HQ

The last verified application commit on `main` is `ca1ab0bfed21d875d57d15425a1ea8bac80c8339`. CI passed on that commit. Work stopped for the checkpoint before starting any new implementation. [Main CI](https://github.com/santifsl/Kivo/actions/runs/45742853802)

## Workspace checkpoint

| Agent | Branch and checkpoint |
| --- | --- |
| Michael | `handoff/claude-hq-phase-5-6` holds this document. The local `main` was fast-forwarded to `ca1ab0bfed21d875d57d15425a1ea8bac80c8339` and matched `origin/main`. |
| Dwight | HQ requested a checkpoint. Workspace branch, HEAD and clean/pushed status are pending while his session is waiting for terminal input. Latest confirmed merged work is PR #52. |
| Jim | HQ requested a checkpoint. Workspace branch, HEAD and clean/pushed status are pending while his session is waiting for terminal input. Latest confirmed merged work is PR #53. |

GitHub showed zero open PRs and no published Phase 6 smoke-test branch when checked. Recheck open PRs and worker workspace receipts before declaring the handoff complete.

## Phase 5 — Complete

- HQ board `P5B` has seven completed tasks. On the integrated PR #49 preview, a Free save returned 402, Clerk test checkout activated Pro, and the signed event returned 200 at 02:04:38.508 UTC. The owner API and Supabase advanced to Pro at billing revision 1 without a manual update. The same save returned 200 and the installed widget displayed the new color after a reload on another origin. The fixtures were cleaned up. [PR #49](https://github.com/santifsl/Kivo/pull/49)
- The product owner confirmed `upgraded` in development PostHog project `757972` at 2026-11-26 02:04:39.579 UTC, about 1.07 seconds after the webhook. HQ task `P5B-T07` contains the acceptance evidence. The earlier CI timeout cleared on rerun, and main CI passed. [Phase 5 CI](https://github.com/santifsl/Kivo/actions/runs/45739745223)

## Phase 6 — In progress

| HQ task | Result |
| --- | --- |
| `P6H-T02` · Framing and CORS | Merged. Combined preview confirmed the framing policy, external embed, and public versus owner CORS. [PR #50](https://github.com/santifsl/Kivo/pull/50) |
| `P6H-T03` · Final security pass | Merged. The §9 audit, development Supabase catalog and combined preview checks passed. No launch security findings remained in scope. [PR #52](https://github.com/santifsl/Kivo/pull/52) |
| `P6H-T01` · Live landing widget | Implementation merged. Local fixture and no-key preview checks passed at desktop and 375 px. Real knowledge-grounded answers remain unverified. [PR #51](https://github.com/santifsl/Kivo/pull/51) |
| `P6H-T04` · Responsive and empty-state polish | Merged. Vercel dashboard and project-tab checks passed at 375 px and 1440 px. [PR #53](https://github.com/santifsl/Kivo/pull/53) |
| `P6H-T05` · Launch smoke test | Assigned to Jim. The integrated nine-step run and production smoke checklist are pending. |

The product owner created the Kivo landing demo project in the development app, obtained its public widget key and configured `LANDING_WIDGET_KEY` in Vercel Preview. The attempted redeploy involved an older **Production** deployment. A new deployment on the **Preview** target with the new variable is unverified. The demo knowledge source's `Ready` status and a live answer are also unverified. The earlier setup action is `aimwwx5abx12`.

## Resume here

1. Open Vercel and identify a **Preview** deployment from the latest integrated application code, with the configured Preview variable in scope for that branch. If needed, redeploy that Preview and record its URL, deployment ID and commit. Keep production settings and promotion untouched.
2. In the development app, confirm the landing demo project's approved knowledge source is `Ready`. Open that Preview at desktop and 375 px, open the corner widget and confirm a real product question receives a knowledge-grounded answer at both widths.
3. Resume `P6H-T05` on the verified integrated Preview. Reuse the existing browser fixtures for all nine steps in `docs/project.md` §2. If the development Clerk webhook is still routed to the old PR #49 host, have the product owner point it at the chosen Preview with its existing bypass and matching signing secret before checkout. Record the results and fixture cleanup, then provide the production smoke checklist to the owner. The owner handles production setup, migrations, promotion and verification.
