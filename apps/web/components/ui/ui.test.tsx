import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { GlassPanel } from "./glass-panel";
import { LoadingState } from "./loading-state";
import { PageHeader } from "./page-header";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const DISABLED_ATTR = / disabled=""/;

describe("GlassPanel", () => {
  it("renders a glass surface from the tokens, as the requested element", () => {
    const out = html(<GlassPanel as="section" className="p-4">hi</GlassPanel>);
    expect(out).toMatch(/^<section /);
    for (const token of ["bg-glass", "backdrop-blur-glass", "shadow-glass", "border-line", "p-4"]) {
      expect(out).toContain(token);
    }
  });

  it("defaults to a div", () => {
    expect(html(<GlassPanel />)).toMatch(/^<div /);
  });

  it("raised surface swaps the background and shadow instead of stacking them", () => {
    const out = html(<GlassPanel surface="raised" />);
    expect(out).toContain('data-surface="raised"');
    expect(out).toContain("bg-glass-strong");
    expect(out).toContain("shadow-glass-lg");
    expect(out).not.toMatch(/\bbg-glass\b(?!-)/);
    expect(out).not.toMatch(/\bshadow-glass\b(?!-)/);
  });
});

describe("Button", () => {
  it.each(["primary", "secondary", "ghost"] as const)("renders the %s variant", (variant) => {
    const out = html(<Button variant={variant}>Go</Button>);
    expect(out).toContain(`data-variant="${variant}"`);
    expect(out).toContain('type="button"');
    expect(out).not.toMatch(DISABLED_ATTR);
  });

  it("loading: disabled, aria-busy and a spinner", () => {
    const out = html(<Button loading>Save</Button>);
    expect(out).toMatch(DISABLED_ATTR);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('data-testid="button-spinner"');
  });

  it("disabled without a spinner", () => {
    const out = html(<Button disabled>New project</Button>);
    expect(out).toMatch(DISABLED_ATTR);
    expect(out).not.toContain("button-spinner");
  });
});

describe("EmptyState", () => {
  it("shows title, description and action", () => {
    const out = html(<EmptyState title="No projects yet" description="Create one" action={<Button>New</Button>} />);
    expect(out).toContain("No projects yet");
    expect(out).toContain("Create one");
    expect(out).toContain("<button");
  });

  it("works with only a title", () => {
    const out = html(<EmptyState title="Nothing here" />);
    expect(out).toContain("Nothing here");
    expect(out).not.toContain("<p");
    expect(out).not.toContain("<button");
  });
});

describe("LoadingState", () => {
  it("is a status region with a label and the requested skeleton rows", () => {
    const out = html(<LoadingState label="Loading projects" rows={5} />);
    expect(out).toContain('role="status"');
    expect(out).toContain("Loading projects");
    expect(out.match(/data-testid="skeleton-row"/g)).toHaveLength(5);
  });
});

describe("ErrorState", () => {
  it("is an alert with a retry button when onRetry is given", () => {
    const out = html(<ErrorState onRetry={() => {}} retryLabel="Retry" />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("Something went wrong");
    expect(out).toMatch(/<button[^>]*>Retry<\/button>/);
  });

  it("has no button without onRetry", () => {
    expect(html(<ErrorState title="Broken" />)).not.toContain("<button");
  });
});

describe("PageHeader", () => {
  it("shows the title as h1, the description and actions", () => {
    const out = html(<PageHeader title="Billing" description="Your plan" actions={<Button>Upgrade</Button>} />);
    expect(out).toContain("<h1");
    expect(out).toContain("Billing");
    expect(out).toContain("Your plan");
    expect(out).toContain("Upgrade");
  });
});
