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
| Page errors | `pageerror` events | **Fail on Overview.** See issue 1. |
| `pnpm e2e:core` | On the same preview, with checkout | **9/9 passed.** See `core-flow-output.txt`. |

The raw findings are in `report.json`.

## Remaining issues, by severity

Nothing blocks launch. Overview, Customize and Billing get re-shot after URK-T10 merges.

### Medium

1. **Fixing in URK-T10.** **Overview throws React error #418 (hydration mismatch)** on every load, in every theme and width. The page looks right, because React re-renders it on the client, but that costs a client re-render and logs an error.
   - Likely cause, read from the code and not confirmed in a dev build: `StatCard` renders `sub` inside a `<p>`, and Overview passes a `UsageBar` there, which is a `<div>`.
   - A `<div>` inside a `<p>` is invalid HTML, so the browser splits the paragraph and hydration fails.
   - Fix: make the `sub` wrapper a `<div>`, or render `UsageBar` with spans.
2. **Fixing in URK-T10.** **The Customize live preview still draws the old widget.** It has no avatar, no Online dot, a rectangular "Send" button and the old input, so it no longer matches the real panel (shot 16). See `1440-light-14-customize-pro.png`.

### Low

3. **Fixing in URK-T10.** **Billing on Free shows "Manage subscription"** in the current-plan card (`*-13-billing-free.png`). With no subscription to manage, an upgrade action would read better.
4. **For the product owner, in the Clerk dashboard.** **Clerk plan copy** (not in the code): Free's description is "Free kivo", in lowercase. Pro's is generic ("Unlock premium features and advanced capabilities in Kivo.").

### Not issues

- Clerk's "Development mode" label (the contrast finding above) disappears on a production instance.
- An external page without `<meta name="viewport">` lays out at 980 px on phones, so the widget looks small there. That's the host page's choice. The audit's test page includes the tag.
