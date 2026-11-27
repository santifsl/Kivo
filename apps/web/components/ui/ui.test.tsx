import { renderToStaticMarkup } from "react-dom/server";
import { FolderOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { Eyebrow } from "./eyebrow";
import { Input, Textarea } from "./input";
import { StatCard } from "./stat-card";
import { ErrorState } from "./error-state";
import { GlassPanel } from "./glass-panel";
import { LoadingState } from "./loading-state";
import { PageHeader } from "./page-header";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const DISABLED_ATTR = / disabled=""/;

describe("GlassPanel", () => {
  it("renders a glass surface from the tokens, as the requested element", () => {
    const out = html(
      <GlassPanel as="section" className="p-4">
        hi
      </GlassPanel>,
    );
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

  it.each(["primary", "secondary", "ghost"] as const)(
    "%s disabled keeps its shape: 40%% opacity and a not-allowed cursor, no hover change",
    (variant) => {
      const out = html(
        <Button variant={variant} disabled>
          Go
        </Button>,
      );
      expect(out).toContain("rounded-full");
      expect(out).toContain("disabled:opacity-40");
      expect(out).toContain("disabled:cursor-not-allowed");
      // Hover styles only apply when enabled; no pointer-events-none (it would hide the cursor).
      expect(out).not.toMatch(/(?<!enabled:)hover:bg-/);
      expect(out).not.toContain("pointer-events-none");
    },
  );

  it("primary is ink/paper (the accent token), never terracotta", () => {
    const out = html(<Button>Go</Button>);
    expect(out).toContain("bg-accent");
    expect(out).toContain("text-accent-ink");
    expect(out).not.toContain("bg-brand");
  });

  it("secondary is an outline pill", () => {
    const out = html(<Button variant="secondary">Go</Button>);
    expect(out).toContain("border-line-strong");
    expect(out).toContain("bg-transparent");
  });

  it("focus ring is terracotta", () => {
    expect(html(<Button>Go</Button>)).toContain("focus-visible:outline-brand");
  });

  it("arrow adds a trailing ↗ icon after the label", () => {
    const out = html(<Button arrow>Open</Button>);
    expect(out).toMatch(/Open<svg[^>]*data-testid="button-arrow"/);
    expect(html(<Button>Open</Button>)).not.toContain("button-arrow");
  });
});

describe("Badge", () => {
  it("neutral by default, no dot", () => {
    const out = html(<Badge>Free</Badge>);
    expect(out).toContain('data-variant="neutral"');
    expect(out).not.toContain("badge-dot");
  });

  it("success has a green dot and green text on a soft green pill", () => {
    const out = html(<Badge variant="success">Active</Badge>);
    expect(out).toContain('data-variant="success"');
    expect(out).toMatch(
      /data-testid="badge-dot"[^>]*bg-success|bg-success[^>]*data-testid="badge-dot"/,
    );
    expect(out).toContain("text-success");
    expect(out).toContain("bg-success-soft");
    expect(out).toMatch(/Active<\/span>$/);
  });
});

describe("Card", () => {
  it("is a 16px-radius card with a line and the card shadow, as the requested element", () => {
    const out = html(
      <Card as="section" className="p-6">
        x
      </Card>,
    );
    expect(out).toMatch(/^<section /);
    for (const token of ["rounded-lg", "border-line", "bg-card", "shadow-card", "p-6"]) {
      expect(out).toContain(token);
    }
  });
});

describe("Input and Textarea", () => {
  it("are rounded with a terracotta focus ring and pass props through", () => {
    for (const out of [
      html(<Input name="title" placeholder="Title" aria-invalid />),
      html(<Textarea name="body" />),
    ]) {
      expect(out).toContain("rounded-md");
      expect(out).toContain("focus-visible:outline-brand");
      expect(out).toContain("aria-invalid:border-danger");
    }
    expect(html(<Input name="title" />)).toMatch(/^<input [^>]*name="title"/);
    expect(html(<Textarea name="body" />)).toMatch(/^<textarea [^>]*name="body"/);
  });
});

describe("Eyebrow", () => {
  it("is a terracotta dash then an uppercase tracked label", () => {
    const out = html(<Eyebrow>How it works</Eyebrow>);
    expect(out).toMatch(
      /data-testid="eyebrow-dash"[^>]*bg-brand|bg-brand[^>]*data-testid="eyebrow-dash"/,
    );
    expect(out).toContain("uppercase");
    expect(out).toContain("tracking-eyebrow");
    expect(out).toContain("How it works");
  });
});

describe("StatCard", () => {
  it("shows the label, a big serif number and optional sub-text", () => {
    const out = html(<StatCard label="Messages" value="42" sub="of 100 this month" />);
    expect(out).toContain("Messages");
    expect(out).toMatch(/font-display[^>]*>42</);
    expect(out).toContain("of 100 this month");
    expect(html(<StatCard label="Projects" value={3} />)).not.toContain("text-ink-subtle");
  });

  it("takes block content as sub without nesting it in a <p> (invalid HTML breaks hydration)", () => {
    const out = html(
      <StatCard
        label="Messages"
        value="38"
        sub={
          <div data-testid="block">
            <div className="bar" />
            Resets Dec 1
          </div>
        }
      />,
    );
    expect(out).toContain('data-testid="block"');
    // No <p> may contain a <div> (the browser would split the <p> and React would hit error #418).
    for (const [paragraph] of out.matchAll(/<p[ >][\s\S]*?<\/p>/g)) expect(paragraph).not.toContain("<div");
  });
});

describe("EmptyState", () => {
  it("shows title, description and action", () => {
    const out = html(
      <EmptyState title="No projects yet" description="Create one" action={<Button>New</Button>} />,
    );
    expect(out).toContain("No projects yet");
    expect(out).toContain("Create one");
    expect(out).toContain("<button");
  });

  it("works with only a title", () => {
    const out = html(<EmptyState title="Nothing here" />);
    expect(out).toContain("Nothing here");
    expect(out).not.toMatch(/<p[ >]/);
    expect(out).not.toContain("<button");
  });

  it("renders a real icon in its tile (default inbox, or the one given)", () => {
    const out = html(<EmptyState title="No projects yet" />);
    expect(out).toMatch(/<svg[^>]*data-testid="empty-state-icon"/);
    expect(out).toContain("lucide-inbox");
    expect(html(<EmptyState title="x" icon={FolderOpen} />)).toContain("lucide-folder-open");
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
  it("shows the title as a serif h1, the description and actions", () => {
    const out = html(
      <PageHeader title="Billing" description="Your plan" actions={<Button>Upgrade</Button>} />,
    );
    expect(out).toMatch(/<h1 [^>]*font-display[^>]*>Billing<\/h1>/);
    expect(out).toContain("Your plan");
    expect(out).toContain("Upgrade");
    expect(out).not.toContain("Breadcrumb");
  });

  it("shows an optional badge next to the title and a breadcrumb above it", () => {
    const out = html(
      <PageHeader
        title="Acme"
        badge={<Badge variant="success">Active</Badge>}
        breadcrumb={<a href="/p">Projects</a>}
      />,
    );
    expect(out.indexOf("Breadcrumb")).toBeLessThan(out.indexOf("<h1"));
    expect(out.indexOf("</h1>")).toBeLessThan(out.indexOf("Active"));
  });
});
