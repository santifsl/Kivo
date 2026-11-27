import type { GetConversationResponse, ListConversationsResponse } from "@kivo/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "../../lib/projects/fake-postgrest";

const owner = vi.hoisted(() => ({ userId: "user_owner" }));
vi.mock("server-only", () => ({}));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: Object.assign(
    async () => ({ userId: owner.userId, getToken: async () => `token_${owner.userId}` }),
    { protect: async () => {} },
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("Not found");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Use the real pages and owner readers with the A1 fake PostgREST transport.
vi.mock("@/components/conversations/conversations-view", () => import("./conversations-view"));
vi.mock("@/components/conversations/conversation-list", () => import("./conversation-list"));
vi.mock("@/components/conversations/conversations-split", () => import("./conversations-split"));
vi.mock("@/components/conversations/load-conversation-rows", () => import("./load-conversation-rows"));
vi.mock("@/components/ui/card", () => import("../ui/card"));
vi.mock("@/lib/conversations/conversations", () => import("../../lib/conversations/conversations"));
vi.mock("@/lib/projects/owner-session", () => import("../../lib/projects/owner-session"));
vi.mock("@/components/ui/loading-state", () => import("../ui/loading-state"));
vi.mock("@/components/ui/error-state", () => import("../ui/error-state"));
vi.mock("@/components/ui/glass-panel", () => import("../ui/glass-panel"));

import ConversationPage from "../../app/dashboard/projects/[id]/conversations/[conversationId]/page";
import ConversationsError from "../../app/dashboard/projects/[id]/conversations/error";
import Loading from "../../app/dashboard/projects/[id]/conversations/loading";
import ConversationsPage from "../../app/dashboard/projects/[id]/conversations/page";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const OLD_THREAD = "33333333-3333-4333-8333-333333333333";
const NEW_THREAD = "44444444-4444-4444-8444-444444444444";
const OLD_TIME = "2026-11-19T23:30:00+00:00";
const NEW_TIME = "2026-11-20T00:00:00+00:00";
const FIRST_MESSAGE = '<img src=x alt="visitor">';
const NEW_MESSAGE = "Do you ship to Canada?";
const savedList: ListConversationsResponse = {
  conversations: [
    {
      id: NEW_THREAD,
      visitor_id: "visitor-2",
      created_at: NEW_TIME,
      preview: NEW_MESSAGE,
      message_count: 1,
    },
    {
      id: OLD_THREAD,
      visitor_id: "visitor-1",
      created_at: OLD_TIME,
      preview: FIRST_MESSAGE,
      message_count: 2,
    },
  ],
};
const savedThread: GetConversationResponse = {
  conversation: {
    id: OLD_THREAD,
    project_id: PROJECT,
    visitor_id: "visitor-1",
    created_at: OLD_TIME,
  },
  messages: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      conversation_id: OLD_THREAD,
      role: "visitor",
      body: FIRST_MESSAGE,
      created_at: OLD_TIME,
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      conversation_id: OLD_THREAD,
      role: "bot",
      body: "Hello!\nHow can I help?",
      created_at: "2026-11-19T23:30:01+00:00",
    },
  ],
};

let pg: ReturnType<typeof fakePostgrest>;
beforeEach(() => {
  owner.userId = "user_owner";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_123");
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const listPage = () =>
  ConversationsPage({
    params: Promise.resolve({ id: PROJECT }),
    searchParams: Promise.resolve({}),
  });
const threadPage = (id = PROJECT) =>
  ConversationPage({
    params: Promise.resolve({ id, conversationId: OLD_THREAD }),
    searchParams: Promise.resolve({}),
  });

const isListQuery = (params: URLSearchParams) => params.get("select")?.includes("first_visitor") ?? false;
const isCountQuery = (params: URLSearchParams) => params.get("select")?.includes("conversations!inner") ?? false;

/** Answers the list reads (project check, summaries, message counts) with `savedList`. */
function serveList(list = savedList) {
  pg.on("GET", "/rest/v1/projects", { body: [{ id: PROJECT }] });
  pg.on("GET", "/rest/v1/conversations", (req) =>
    isListQuery(req.params)
      ? {
          body: list.conversations.map(({ id, created_at, visitor_id, preview }) => ({
            id,
            created_at,
            visitor_id,
            first_visitor: [{ body: preview }],
          })),
        }
      : { body: [savedThread.conversation] },
  );
  pg.on("GET", "/rest/v1/messages", (req) =>
    isCountQuery(req.params)
      ? {
          body: [
            { id: "message-3", conversation_id: NEW_THREAD },
            ...savedThread.messages.map(({ id, conversation_id }) => ({ id, conversation_id })),
          ],
        }
      : { body: savedThread.messages },
  );
}

describe("Conversations dashboard", () => {
  it("shows an empty state and refresh control before the first chat", async () => {
    pg.on("GET", "/rest/v1/projects", { body: [{ id: PROJECT }] });
    pg.on("GET", "/rest/v1/conversations", { body: [] });

    const html = renderToStaticMarkup(await listPage());
    expect(html).toContain("No conversations yet");
    expect(html).toMatch(/<button[^>]*>Refresh<\/button>/);
  });

  it("shows newest-first links, escaped previews, counts, and timestamps", async () => {
    serveList();

    const html = renderToStaticMarkup(await listPage());
    const oldLink = `href="/dashboard/projects/${PROJECT}/conversations/${OLD_THREAD}"`;
    const newLink = `href="/dashboard/projects/${PROJECT}/conversations/${NEW_THREAD}"`;
    expect(html).toContain(oldLink);
    expect(html).toContain(newLink);
    expect(html.indexOf(newLink)).toBeLessThan(html.indexOf(oldLink));
    expect(html).toContain(NEW_MESSAGE);
    expect(html).toContain("&lt;img src=x alt=&quot;visitor&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).toMatch(/1 message</);
    expect(html).toMatch(/2 messages</);
    expect(html).toContain(`dateTime="${OLD_TIME}"`);
    // Relative time, with the full UTC time on hover.
    expect(html).toMatch(/title="Nov 19, 2026, 11:30\sPM UTC">[^<]+</);
    expect(html).toContain("lucide-message-square");
    // No thread open: the right pane's hint, and the list shows at every width.
    expect(html).toContain("Pick a conversation");
    expect(html).not.toContain('aria-current="page"');
  });

  it("renders the oldest-first thread with role labels, plain text and a way back", async () => {
    serveList();

    const html = renderToStaticMarkup(await threadPage());
    expect(html).toContain(`href="/dashboard/projects/${PROJECT}/conversations"`);
    expect(html).toMatch(/<button[^>]*>Refresh<\/button>/);
    expect(html).toContain("<ol");
    expect(html).toContain(">Visitor</span>");
    expect(html).toContain(">Bot</span>");
    // Visitor on the right with the ink bubble; bot on the left, grey, with the K.
    const visitor = /<li data-role="visitor" class="([^"]*)"[\s\S]*?<\/li>/.exec(html);
    const bot = /<li data-role="bot" class="([^"]*)"[\s\S]*?<\/li>/.exec(html);
    expect(visitor?.[1]).toContain("self-end");
    expect(visitor?.[0]).toContain("bg-accent text-accent-ink");
    expect(visitor?.[0]).not.toContain("<svg");
    expect(bot?.[1]).toContain("self-start");
    expect(bot?.[0]).toContain("bg-wash-strong");
    expect(bot?.[0]).toMatch(/<svg[^>]*aria-hidden="true"/);
    // Next to the list, with this thread's row current; text only inside the thread region.
    const current = [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(current).toHaveLength(1);
    expect(current[0]).toContain(`href="/dashboard/projects/${PROJECT}/conversations/${OLD_THREAD}"`);
    const region = /<section[^>]*aria-labelledby="conversation-heading"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    expect(region.match(/ph-no-capture/g)).toHaveLength(2);
    expect(html.indexOf(">Visitor</span>")).toBeLessThan(html.indexOf(">Bot</span>"));
    expect(html).toContain("&lt;img src=x alt=&quot;visitor&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("Hello!\nHow can I help?");
  });

  it("does not expose a thread that RLS hides from the caller", async () => {
    owner.userId = "user_other";
    pg.on("GET", "/rest/v1/conversations", ({ headers }) => {
      expect(headers.get("authorization")).toBe("Bearer token_user_other");
      return { body: [] };
    });
    await expect(threadPage()).rejects.toThrow("Not found");
    expect(pg.to("/rest/v1/messages")).toHaveLength(0);
  });

  it("returns not found if an owned thread belongs to another project", async () => {
    serveList();
    await expect(threadPage(OTHER_PROJECT)).rejects.toThrow("Not found");
  });

  it("shows accessible loading and error states with a retry action", async () => {
    const loading = renderToStaticMarkup(<Loading />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading conversations…");

    pg.on("GET", "/rest/v1/projects", { body: [{ id: PROJECT }] });
    pg.on("GET", "/rest/v1/conversations", pgError("TEST", "database failure"));
    await expect(listPage()).rejects.toThrow("List conversations failed");
    const error = renderToStaticMarkup(<ConversationsError retry={vi.fn()} />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("load conversations");
    expect(error).toContain("Try again");
  });
});
