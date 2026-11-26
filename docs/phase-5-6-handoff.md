# Kivo Phase 5–6 handoff to Claude HQ

The latest verified application commit on `main` is `b53fff9c90d45a00822d93a9ab5620e666f60fc1`. CI passed, and the protected fix Preview has the same Git tree as this commit. [Main CI](https://github.com/santifsl/Kivo/actions/runs/45888203130)

## Workspace checkpoint

| Agent | Branch and checkpoint |
| --- | --- |
| Michael | `handoff/claude-hq-phase-5-6` holds this document. Workspace clean and branch pushed. |
| Dwight | `p6h-t06-same-origin-preview-widget` at `acecdcdc4037260819e3d69ca9d9bf60ed116e3e`, matching GitHub `refs/pull/54/head`. Clean workspace, no stashes and zero unpushed commits. The remote task branch was deleted after merge. [PR #54](https://github.com/santifsl/Kivo/pull/54) |
| Jim | `p6h-t05-launch-smoke-test` at `ca1ab0bfed21d875d57d15425a1ea8bac80c8339`, matching its published branch. Clean workspace, no stashes and zero unpushed commits. The branch is one commit behind `origin/main`. |

GitHub showed zero open PRs when checked.

## Phase 5 — Complete

- HQ board `P5B` has seven completed tasks. On the integrated PR #49 preview, a Free save returned 402, Clerk test checkout activated Pro, and the signed event returned 200 at 02:04:38.508 UTC. The owner API and Supabase advanced to Pro at billing revision 1 without a manual update. The same save returned 200 and the installed widget displayed the new color after a reload on another origin. The fixtures were cleaned up. [PR #49](https://github.com/santifsl/Kivo/pull/49)
- The product owner confirmed `upgraded` in development PostHog project `757972` at 2026-11-26 02:04:39.579 UTC, about 1.07 seconds after the webhook. HQ task `P5B-T07` contains the acceptance evidence. The earlier CI timeout cleared on rerun, and main CI passed. [Phase 5 CI](https://github.com/santifsl/Kivo/actions/runs/45739745223)

## Phase 6 — In progress

| HQ task | Result |
| --- | --- |
| `P6H-T02` · Framing and CORS | Merged. Combined preview confirmed the framing policy, external embed, and public versus owner CORS. [PR #50](https://github.com/santifsl/Kivo/pull/50) |
| `P6H-T03` · Final security pass | Merged. The §9 audit, development Supabase catalog and combined preview checks passed. No launch security findings remained in scope. [PR #52](https://github.com/santifsl/Kivo/pull/52) |
| `P6H-T01` · Live landing widget | Implementation merged. The development demo source is Ready and indexed. Jim verified grounded answers at 1440 px and 375 px on the protected fix Preview. [PR #51](https://github.com/santifsl/Kivo/pull/51) |
| `P6H-T04` · Responsive and empty-state polish | Merged. Vercel dashboard and project-tab checks passed at 375 px and 1440 px. [PR #53](https://github.com/santifsl/Kivo/pull/53) |
| `P6H-T06` · Preview widget access | Merged. The same-origin config fetch uses the existing browser session cookie and external config fetches stay credential-free. The protected fix Preview returned config HTTP 200 and mounted the launcher without per-request automation headers. Signed-out Preview requests returned 302 and a Preview-cookie-only owner API request returned Clerk 401. The widget contains no bypass secret. [PR #54](https://github.com/santifsl/Kivo/pull/54) |
| `P6H-T05` · Launch smoke test | Assigned to Jim and in progress in HQ. Checkout and customization passed. The remaining integrated checks and the production checklist are described below. |

### Verified Preview evidence

- **Checkout and Pro-only customization.** On Preview `8N84t7Tbo`, a fresh Free account saw locked Customize and received HTTP 402 on save. Clerk development checkout returned 200 at 2026-11-26 20:06:38.009 UTC. The signed `subscriptionItem.active` delivery returned 200 from the same Preview at 20:06:38.452 UTC. Supabase recorded Pro at billing revision 1. The same save returned 200, and the separately installed widget showed `#2468ac` after reload. The Clerk owner and development account, project and config were removed. [Checkout Preview](https://kivo-pk48z0q9b-santifsl.vercel.app/)
- **Protected loader fix and grounded answers.** Vercel skipped the automatic build because its affected-project detection did not see the direct widget build dependency. The owner manually deployed PR #54 head `acecdcdc4037260819e3d69ca9d9bf60ed116e3e` in Preview as `7Yt7PHeN2fF2xMCfkfPBASE1HQrF` with `LANDING_WIDGET_KEY`. Its Git tree is identical to the merged `main` commit above. Jim verified grounded answers at 1440 px (20:08:51.852 UTC) and 375 px (20:08:57.700 UTC) on November 26. Config and chat returned HTTP 200, and only initial navigation used authorization headers. The answer matched the Ready source instructions to add business information in Knowledge and wait for processing before copying the snippet. [Protected fix Preview](https://kivo-git-p6h-t06-same-origin-preview-widget-santifsl.vercel.app/)

## Resume here

1. Resume Jim's `P6H-T05` and fast-forward the clean task branch to `origin/main` at `b53fff9c90d45a00822d93a9ab5620e666f60fc1`.
2. On the protected development Preview, create a disposable owner and upload the existing Phase 3 PDF fixture. Wait for `Ready`, install the widget in a plain HTML page on another origin, verify a PDF-grounded answer and confirm the matching thread in Conversations. Record results and fixture cleanup. Keep the verified landing and checkout evidence above with the nine-step acceptance record. For any fresh checkout on the fixed Preview, confirm Clerk development billing routes to that exact host first, with its existing bypass and matching signing secret.
3. Finish the production smoke checklist covering all nine steps in `docs/project.md` §2 and hand it to the product owner, who handles production setup, migrations, promotion and verification.
