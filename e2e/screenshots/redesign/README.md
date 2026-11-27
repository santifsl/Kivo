# Redesign visual QA (URK-T09)

The final pass over the Kivo redesign: on a preview of main `650008d` plus e2e-only commits, on 2026-11-27.

To re-run it: `node e2e/redesign-audit.ts <preview-url>`. The script needs the same variables as `pnpm e2e:core`. It replaces only this folder's PNGs and `report.json`; this README and `core-flow-output.txt` stay. If cleanup of its test owner fails, the run fails.

## What was shot

There are 89 screenshots, named `<width>-<theme>-<nn>-<screen>.png`.

| # | Screen | Variants |
|---|---|---|
| 01 | Landing | dark only (it's always dark), at 375, 768 and 1440 |
| 02–03 | Sign-in, sign-up | light/dark × 375/768/1440 |
| 04–05 | Projects, empty and with one project | light/dark × 375/768/1440 |
| 06–08 | Overview, Knowledge, Install | light/dark × 375/768/1440 |
| 09 | Conversations, empty state | light/dark × 375/768/1440 |
| 10–11 | Conversations list, and one thread | light/dark × 375/768/1440 |
| 12–13 | Customize and Billing on Free | light/dark × 375/768/1440 |
| 14–15 | Customize and Billing on Pro, after the test-card checkout | light/dark × 375/1440 |
| 16 | Widget panel open on a light, cross-origin page | 375/768/1440; the panel itself is never themed |
| 17 | Black launcher on the dark landing | 375/768/1440 |

## Checks and results

| Check | How | Result |
|---|---|---|
| Horizontal overflow | `scrollWidth` vs. the viewport, on every shot and inside the widget iframe | **Pass.** No overflow on any screen, theme or width. |
| Text contrast, WCAG AA | Every visible text node, plus form field values and placeholders (in their `::placeholder` color), against the stacked background: 4.5:1, or 3:1 for large text | **Pass for app text.** The only failure is Clerk's "Development mode" label (2.83:1). It shows only on development instances. |
| Terracotta on ink | `#C96A3F` on `#0B0B0C` | **5.26:1.** AA for all text. |
| Terracotta on paper | `#C96A3F` on `#F7F7F6` | **3.49:1.** AA for large text and icons only. The scan found no small terracotta text on light surfaces. |
| Terracotta on graphite, on white | `#2A2A2D` / `#FFFFFF` | 3.83:1 and 3.74:1. Large text and icons only. |
| Keyboard focus visible | Tab through each screen at 1440, light and dark, and through the open widget panel. Each stop must look different focused vs. blurred. | **Pass.** Every stop on every screen changes visibly, including the panel's Close, Message and "Powered by" stops. |
| Reduced motion | `prefers-reduced-motion: reduce`: no running animations (spinners excepted), no hidden reveals. The widget is opened too: no panel transition, and nothing animating in the loader or the panel. | **Pass.** 0 running, 0 hidden. The widget's transition is `0s`. |
| Nothing stuck invisible | After scrolling through each page: text with opacity below 0.05, `visibility: hidden`, or `data-reveal="hidden"` | **Pass.** |
| Bot avatar once per message | Count of visible avatar marks in each bot message in a thread | **Pass.** 1 per message, light and dark. |
| Page and console errors | `pageerror` events; the re-check adds console errors | **Failed on Overview in the first pass** (issue 1). **Clean after URK-T10.** |
| `pnpm e2e:core` | On the same preview, with checkout | **9/9 passed.** See `core-flow-output.txt`. |

The raw findings are in `report.json`.

## Re-check after URK-T10

URK-T10 (#67, main `a890d5f`) fixed issues 1–3. On a preview of main `a890d5f` plus e2e-only commits, `node e2e/redesign-audit.ts <preview-url> --recheck` re-shot the affected screens:
- Overview, and Customize and Billing on Free: light/dark × 375/768/1440.
- Customize and Billing on Pro, after the test-card checkout: light/dark × 375/1440.

The re-shot files replace the earlier ones under the same names. Results are in `recheck-report.json`:

| Check | Result |
|---|---|
| Page errors and console errors | **None** on all 26 shots |
| Overflow, contrast, nothing invisible | **Pass** |

The re-check makes no widget question, so the new Overview shots have no recent conversations.

## Issues, by severity

Nothing blocks launch.

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | Medium | Overview threw React error #418 (hydration mismatch) on every load. The cause: `StatCard` put `sub` in a `<p>`, and Overview passed a `UsageBar` `<div>` there. | **Fixed in URK-T10.** No page or console errors in the re-check. |
| 2 | Medium | The Customize live preview drew the old widget (no avatar, no Online dot, a square "Send" button). | **Fixed in URK-T10.** It now matches the real panel (`*-14-customize-pro.png`). |
| 3 | Low | Billing on Free showed "Manage subscription". | **Fixed in URK-T10.** It now shows "Upgrade to Pro" (`*-13-billing-free.png`). |
| 4 | Low | Clerk plan copy, set in the Clerk dashboard and not in the code: Free's description reads "Free kivo", in lowercase. Pro's is generic. | **Open, for the product owner** (Clerk dashboard). |

### Not issues

- Clerk's "Development mode" label (the contrast finding above) disappears on a production instance.
- An external page without `<meta name="viewport">` lays out at 980 px on phones, so the widget looks small there. That's the host page's choice. The audit's test page includes the tag.
