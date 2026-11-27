import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OwnerClient } from "@/lib/supabase/owner";
import { loadOverview } from "./load-overview";
import { formatRelativeTime, type OverviewData } from "./overview";
import { OverviewView } from "./overview-view";

vi.mock("server-only", () => ({}));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-11-27T12:00:00Z");
const project = { id: PROJECT_ID, messages_used: 38, period_start: "2026-11-01T00:00:00Z" };

type Result = { data?: unknown; count?: number | null; error?: { code: string } | null };

/** A chainable supabase-js stand-in: records each query's calls, then resolves to `pick(table, calls)`. */
function stubClient(pick: (table: string, calls: [string, unknown[]][]) => Result) {
  const queries: { table: string; calls: [string, unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const query = { table, calls: [] as [string, unknown[]][] };
      queries.push(query);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_, prop: string) {
            if (prop === "then") {
              const result = { data: null, count: null, error: null, ...pick(table, query.calls) };
              return (resolve: (value: Result) => void) => resolve(result);
            }
            return (...args: unknown[]) => {
              query.calls.push([prop, args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { client: client as unknown as OwnerClient, queries };
}

const isHead = (calls: [string, unknown[]][]) =>
  calls.some(([name, args]) => name === "select" && (args[1] as { head?: boolean } | undefined)?.head);

describe("loadOverview", () => {
  it("counts conversations and sources, and maps the latest 5 with their first visitor message", async () => {
    const { client, queries } = stubClient((table, calls) => {
      if (table === "knowledge_sources") return { data: [{ status: "ready" }, { status: "processing" }] };
      if (isHead(calls)) return { count: 12 };
      return {
        data: [
          { id: "c2", created_at: "2026-11-27T11:00:00Z", first_visitor: [{ body: "Do you ship to Spain?" }] },
          { id: "c1", created_at: "2026-11-26T09:00:00Z", first_visitor: [] },
        ],
      };
    });

    const data = await loadOverview(client, PROJECT_ID);

    expect(data).toEqual({
      conversationCount: 12,
      sourceCount: 2,
      readySourceCount: 1,
      recent: [
        { id: "c2", created_at: "2026-11-27T11:00:00Z", preview: "Do you ship to Spain?" },
        { id: "c1", created_at: "2026-11-26T09:00:00Z", preview: "" },
      ],
    });
    // Every read is scoped to this project (RLS scopes it to the owner) and the list stops at 5.
    for (const query of queries) expect(query.calls).toContainEqual(["eq", ["project_id", PROJECT_ID]]);
    const recent = queries.find((q) => q.table === "conversations" && !isHead(q.calls));
    expect(recent?.calls).toContainEqual(["limit", [5]]);
    expect(recent?.calls).toContainEqual(["eq", ["first_visitor.role", "visitor"]]);
  });

  it("throws when a read fails, so the page shows its error state", async () => {
    const { client } = stubClient((table) => (table === "knowledge_sources" ? { error: { code: "42501" } } : { data: [], count: 0 }));
    await expect(loadOverview(client, PROJECT_ID)).rejects.toThrow("42501");
  });
});

const empty: OverviewData = { conversationCount: 0, sourceCount: 0, readySourceCount: 0, recent: [] };

describe("OverviewView", () => {
  it("shows the three stats from the data", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        project={project}
        plan="free"
        now={now}
        data={{ ...empty, conversationCount: 1234, sourceCount: 2, readySourceCount: 1 }}
      />,
    );
    expect(html).toContain("Messages this month");
    expect(html).toMatch(/38<span[^>]*> \/ 100<\/span>/);
    expect(html).toContain("Resets Dec 1, 2026");
    expect(html).toContain("1,234");
    expect(html).toMatch(/2<span[^>]*> \/ 3<\/span>/);
    expect(html).toContain("1 ready");
  });

  it("shows the Get started checklist until a source is ready, and an empty recent list", () => {
    const html = renderToStaticMarkup(<OverviewView project={project} plan="free" now={now} data={empty} />);
    expect(html).toContain("Get started");
    expect(html.indexOf("Add knowledge")).toBeLessThan(html.indexOf("Install widget"));
    expect(html.indexOf("Install widget")).toBeLessThan(html.indexOf("Test a question"));
    expect(html).toContain(`href="/dashboard/projects/${PROJECT_ID}/knowledge"`);
    expect(html).toContain("No conversations yet");
    expect(html).not.toContain("View all");
  });

  it("hides the checklist once a source is ready, and lists recent conversations as text", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        project={project}
        plan="pro"
        now={now}
        data={{
          ...empty,
          sourceCount: 1,
          readySourceCount: 1,
          conversationCount: 1,
          recent: [{ id: "c1", created_at: "2026-11-27T10:00:00Z", preview: "<b>hi</b>" }],
        }}
      />,
    );
    expect(html).not.toContain("Get started");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain("2 hours ago");
    expect(html).toContain(`href="/dashboard/projects/${PROJECT_ID}/conversations/c1"`);
    expect(html).toContain(`href="/dashboard/projects/${PROJECT_ID}/conversations"`);
    expect(html).toContain("2,000");
  });

  it("keeps rendering when the plan can't be read", () => {
    const html = renderToStaticMarkup(<OverviewView project={project} plan={null} now={now} data={empty} />);
    expect(html).toContain("Usage unavailable");
  });
});

describe("formatRelativeTime", () => {
  it.each([
    ["2026-11-27T11:59:30Z", "just now"],
    ["2026-11-27T11:55:00Z", "5 minutes ago"],
    ["2026-11-26T12:00:00Z", "yesterday"],
    ["2026-11-13T12:00:00Z", "2 weeks ago"],
    ["nope", "nope"],
  ])("%s → %s", (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now)).toBe(expected);
  });
});
