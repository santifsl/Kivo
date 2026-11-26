# UI audit, 2026-11-26

Preview: kivo-git-p3k-t13-cap-extracted-text-santifsl.vercel.app (app code = main).
Fresh Free test user per width. Full-page captures after scrolling to the bottom (scroll-reveal triggered).
Files: `<width>-<nn>-<page>.png` at 1440 and 375. `report.json` has the overflow check, Billing text, Clerk billing calls and console output.

Note: in full-page captures, fixed elements (the landing "Chat" launcher) are drawn at their viewport position, partway down the page. That's how full-page capture works, not a layout bug.

## Billing (05)
A fresh Free user sees **both** Free and Pro. `GET /v1/billing/plans?payer_type=user`, `/v1/me/billing/subscription` and `/v1/me/billing/payment_methods` all return 200, with no console errors.
- **Pro's "Subscribe" button text is nearly invisible**: white text on a near-white button. The Free card's "Active" badge is a blank white pill.
- Clerk's plan data: "pro" is lowercase, and Free's description is "Free kivo".

## Layout issues seen
1. Landing: the landing widget's black "Chat" launcher sits on a black page (very low contrast). The "Live demo" section is just a heading and a sentence over a large empty area.
2. Landing 1440 / dashboard 375: the background gradient stops with a visible edge at one screen height on tall pages (possibly a capture artifact).
3. Dashboard top bar: empty on the left at 1440 (no page title or breadcrumb). It only holds the plan pill and avatar.
4. Projects (empty): the icon tile above "No projects yet" is a blank square with no icon.
5. Disabled primary buttons ("Create project", "Add text") are a washed-out grey. They look broken rather than disabled.
6. Knowledge 1440: the "Upload a file" card stretches to the height of "Paste text" and leaves a big empty area under the drop zone.
7. Knowledge 375: the source card's "Delete" button is indented more than the card content.
8. Install: the snippet wraps in the middle of the URL and the key. The Copy button stays "Copied".
9. Conversation thread: the visitor is on the left and the bot on the right, the reverse of the widget (visitor right, bot left).
10. Customize (Free locked): "Button color" and "Button position" stay white, while the other disabled fields are grey. The disabled styling is inconsistent.
11. Customize preview: the "Chat" launcher touches the preview frame's bottom-right corner.
12. Sign-in / sign-up: Clerk's default card with no Kivo header or link back to the landing page. Theming doesn't match the dashboard.

No horizontal overflow on any page at 1440 or 375 (scrollWidth equals the viewport width everywhere).
