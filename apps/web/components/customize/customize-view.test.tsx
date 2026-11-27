import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_WIDGET_CONFIG } from "@kivo/shared";
import { describe, expect, it } from "vitest";
import { CONTROL_CLASSES, CustomizeView, LOCKED_BOX_CLASSES } from "./customize-view";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const render = (plan: "free" | "pro") =>
  renderToStaticMarkup(<CustomizeView projectId={PROJECT} plan={plan} config={DEFAULT_WIDGET_CONFIG} />);

/** The class attribute of each element matching `tag` inside the settings form. */
function classesOf(html: string, tag: string): string[] {
  const form = /<form[\s\S]*<\/form>/.exec(html)?.[0] ?? "";
  return [...form.matchAll(new RegExp(`<${tag}[^>]*class="([^"]*)"`, "g"))].map((m) => m[1] ?? "");
}

describe("CustomizeView on Free", () => {
  const html = render("free");

  it("locks every control in one disabled fieldset", () => {
    expect(html).toMatch(/<fieldset disabled=""/);
  });

  it("gives every control the same locked style", () => {
    const disabledLook = ["disabled:cursor-not-allowed", "disabled:opacity-60"];
    // Selects and text inputs (the color swatch and checkbox have their own box, below).
    const fields = [...classesOf(html, "select"), ...classesOf(html, "input")].filter((c) => !c.includes("size-"));
    expect(fields).toHaveLength(4);
    for (const classes of fields) for (const c of disabledLook) expect(classes).toContain(c);
    expect(CONTROL_CLASSES).toContain("disabled:opacity-60");
    expect(LOCKED_BOX_CLASSES).toBe("has-disabled:cursor-not-allowed has-disabled:opacity-60");
    // The color picker's box and the checkbox row dim the same way.
    expect(html.match(/has-disabled:opacity-60/g)).toHaveLength(2);
    // Two selects + two text inputs use the shared control style.
    expect(html.split(CONTROL_CLASSES).length - 1).toBe(4);
  });

  it("shows the Pro upsell linking to Billing, named exactly 'Upgrade to Pro' (the arrow is decorative)", () => {
    expect(html).toContain("Make the widget yours with Pro");
    const links = [...html.matchAll(/<a [^>]*href="\/dashboard\/billing"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links).toHaveLength(1);
    const inner = links[0]?.[1] ?? "";
    expect(inner.replace(/<svg[\s\S]*?<\/svg>/g, "").trim()).toBe("Upgrade to Pro");
    expect(inner).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toContain("Save changes");
  });
});

describe("CustomizeView on Pro", () => {
  const html = render("pro");

  it("unlocks the controls, hides the upsell and offers Save", () => {
    expect(html).not.toMatch(/<fieldset disabled=""/);
    expect(html).not.toContain("Make the widget yours with Pro");
    expect(html).not.toContain('href="/dashboard/billing"');
    expect(html).toContain("Save changes");
  });
});
