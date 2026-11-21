import { renderToStaticMarkup } from "react-dom/server";
import type { Plan, Project } from "@kivo/shared";
import { describe, expect, it, vi } from "vitest";
import { formatProjectDate } from "./format-date";
import { isAtProjectLimit, projectLimitMessage } from "./project-limit";
import { DEFAULT_PROJECT_TAB, getActiveTab, PROJECT_TABS, projectTabHref } from "./project-tabs";
import { ProjectTabsView } from "./project-tabs-nav";
import { createProjectRequest, deleteProjectRequest, renameProjectRequest } from "./projects-api";
import { ProjectsScreen, type ProjectsHandlers } from "./projects-screen";
import {
  initialProjectsState,
  projectsReducer,
  showsLimitMessage,
  type ProjectsAction,
  type ProjectsState,
} from "./projects-state";

const FREE_LIMIT_TEXT = "Free includes 1 project. Pro includes 5.";

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme docs",
  public_key: "pk_abcdefgh1234",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00.000Z",
  created_at: "2026-11-19T10:00:00.000Z",
  ...overrides,
});
const other = project({ id: "22222222-2222-4222-8222-222222222222", name: "Blog", created_at: "2026-11-18T10:00:00.000Z" });

const noop: ProjectsHandlers = {
  onDraftChange: () => {},
  onCreate: () => {},
  onRenameOpen: () => {},
  onRenameDraftChange: () => {},
  onRenameSubmit: () => {},
  onDeleteOpen: () => {},
  onDeleteConfirm: () => {},
  onDialogClose: () => {},
};

const run = (state: ProjectsState, ...actions: ProjectsAction[]) => actions.reduce(projectsReducer, state);
const render = (state: ProjectsState) => renderToStaticMarkup(<ProjectsScreen state={state} handlers={noop} />);
const state = (projects: Project[], plan: Plan = "free") => initialProjectsState(projects, plan);

describe("ProjectsScreen", () => {
  it("lists the projects with their names and created dates", () => {
    const html = render(state([project(), other], "pro"));
    expect(html).toContain("Acme docs");
    expect(html).toContain("Blog");
    expect(html).toContain("Nov 19, 2026");
    expect(html).toContain('href="/dashboard/projects/11111111-1111-4111-8111-111111111111"');
    expect(html).not.toContain("No projects yet");
  });

  it("shows the empty state with the create form when there are no projects", () => {
    const html = render(state([]));
    expect(html).toContain("No projects yet");
    expect(html).toContain('id="new-project-name"');
    expect(html).toContain("Create project");
    expect(html).not.toContain(FREE_LIMIT_TEXT);
  });

  it("renders project names as text, never HTML", () => {
    const html = render(state([project({ name: '<img src=x onerror="alert(1)">' })], "pro"));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("Free at the limit: shows the upgrade message and link before any submit, and disables create", () => {
    const html = render(state([project()], "free"));
    expect(html).toContain(FREE_LIMIT_TEXT);
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toMatch(/<input[^>]*id="new-project-name"[^>]*disabled=""/);
  });

  it("Pro under the limit: no message", () => {
    expect(render(state([project()], "pro"))).not.toContain('data-testid="project-limit"');
  });

  it("403 plan_limit from the server shows the upgrade message, even under the limit by count", () => {
    // e.g. a project created in another tab: the client count says 0, the server says no.
    const after = run(
      state([], "free"),
      { type: "draftChanged", name: "Second" },
      { type: "createStarted" },
      { type: "createFailed", error: { code: "plan_limit", message: "Your plan's project limit is reached." } },
    );
    expect(showsLimitMessage(after)).toBe(true);
    expect(after.createError).toBeNull();
    const html = render(after);
    expect(html).toContain(FREE_LIMIT_TEXT);
    expect(html).toContain('href="/dashboard/billing"');
  });

  it("other create errors show the server's message", () => {
    const after = run(state([]), { type: "createFailed", error: { code: "invalid_input", message: "Send a project name of 1–80 characters." } });
    expect(render(after)).toContain("Send a project name of 1–80 characters.");
    expect(showsLimitMessage(after)).toBe(false);
  });

  it("delete asks for confirmation naming the project and the widget", () => {
    const listed = state([project(), other], "pro");
    expect(render(listed)).not.toContain("<dialog");

    const confirming = run(listed, { type: "deleteOpened", project: project() });
    // Opening the dialog removes nothing; only confirming does.
    expect(confirming.projects).toHaveLength(2);
    const html = render(confirming);
    expect(html).toContain("<dialog");
    expect(html).toContain("Delete project?");
    expect(html).toContain("Acme docs");
    expect(html).toContain("Its widget stops working");
    expect(html).toContain("Delete project</button>");
    expect(html).toContain("Cancel");
  });

  it("the rename dialog starts with the current name", () => {
    const html = render(run(state([project()], "pro"), { type: "renameOpened", project: project() }));
    expect(html).toContain("Rename project");
    expect(html).toMatch(/<input[^>]*value="Acme docs"/);
  });

  it("shows a dialog error from the API", () => {
    const after = run(
      state([project()], "pro"),
      { type: "deleteOpened", project: project() },
      { type: "dialogStarted" },
      { type: "dialogFailed", error: { code: "not_found", message: "Project not found." } },
    );
    expect(render(after)).toContain("Project not found.");
  });
});

describe("projectsReducer", () => {
  it("create adds the project first and clears the draft", () => {
    const created = project({ id: "33333333-3333-4333-8333-333333333333", name: "New" });
    const after = run(state([other], "pro"), { type: "draftChanged", name: "New" }, { type: "createStarted" }, {
      type: "createSucceeded",
      project: created,
    });
    expect(after.projects.map((p) => p.name)).toEqual(["New", "Blog"]);
    expect(after.draft).toBe("");
    expect(after.pending).toBeNull();
  });

  it("rename replaces the project and closes the dialog", () => {
    const after = run(
      state([project(), other], "pro"),
      { type: "renameOpened", project: project() },
      { type: "renameDraftChanged", name: "Renamed" },
      { type: "dialogStarted" },
      { type: "renameSucceeded", project: project({ name: "Renamed" }) },
    );
    expect(after.projects.map((p) => p.name)).toEqual(["Renamed", "Blog"]);
    expect(after.dialog).toBeNull();
  });

  it("delete removes the project and clears a server limit flag", () => {
    const after = run(
      state([project()], "free"),
      { type: "createFailed", error: { code: "plan_limit", message: "limit" } },
      { type: "deleteOpened", project: project() },
      { type: "dialogStarted" },
      { type: "deleteSucceeded", id: project().id },
    );
    expect(after.projects).toEqual([]);
    expect(after.dialog).toBeNull();
    expect(showsLimitMessage(after)).toBe(false);
  });

  it("fresh server props replace the list and plan, keeping form edits", () => {
    const editing = run(
      state([project(), other], "pro"),
      { type: "draftChanged", name: "Half typed" },
      { type: "renameOpened", project: other },
      { type: "renameDraftChanged", name: "Blog 2" },
    );
    const synced = run(editing, { type: "serverSynced", projects: [other], plan: "pro" });
    expect(synced.projects).toEqual([other]);
    expect(synced.draft).toBe("Half typed");
    expect(synced.dialog).toMatchObject({ kind: "rename", name: "Blog 2" });
  });

  it("a sync that frees a slot re-enables create on Free", () => {
    const atLimit = state([project()], "free");
    expect(render(atLimit)).toMatch(/<input[^>]*id="new-project-name"[^>]*disabled=""/);
    const synced = run(atLimit, { type: "serverSynced", projects: [], plan: "free" });
    expect(render(synced)).not.toMatch(/<input[^>]*id="new-project-name"[^>]*disabled=""/);
    expect(showsLimitMessage(synced)).toBe(false);
  });

  it("create doesn't duplicate a project a refresh already brought in", () => {
    const created = project({ id: "33333333-3333-4333-8333-333333333333", name: "New" });
    const after = run(state([other], "pro"), { type: "serverSynced", projects: [created, other], plan: "pro" }, {
      type: "createSucceeded",
      project: created,
    });
    expect(after.projects.map((p) => p.id)).toEqual([created.id, other.id]);
  });

  it("the dialog can't be closed while its request runs", () => {
    const running = run(state([project()], "pro"), { type: "deleteOpened", project: project() }, { type: "dialogStarted" });
    expect(run(running, { type: "dialogClosed" }).dialog).not.toBeNull();
  });
});

describe("project limit", () => {
  it("follows PLAN_LIMITS", () => {
    expect(isAtProjectLimit("free", 0)).toBe(false);
    expect(isAtProjectLimit("free", 1)).toBe(true);
    expect(isAtProjectLimit("pro", 4)).toBe(false);
    expect(isAtProjectLimit("pro", 5)).toBe(true);
    expect(projectLimitMessage("free")).toBe(FREE_LIMIT_TEXT);
    expect(projectLimitMessage("pro")).toContain("Pro includes 5 projects.");
  });
});

describe("projects API client", () => {
  const respond = (status: number, body: unknown) =>
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

  it("POSTs the name and returns the project", async () => {
    const fetchImpl = respond(201, { project: project() });
    const result = await createProjectRequest("Acme docs", fetchImpl);
    expect(result).toEqual({ ok: true, data: { project: project() } });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("/api/projects");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Acme docs" }));
  });

  it("returns a 403 plan_limit as its code and message", async () => {
    const error = { code: "plan_limit", message: "Your plan's project limit is reached. Upgrade to add more." };
    expect(await createProjectRequest("Second", respond(403, { error }))).toEqual({ ok: false, error });
  });

  it("PATCHes and DELETEs the project URL", async () => {
    const patch = respond(200, { project: project({ name: "New" }) });
    await renameProjectRequest(project().id, "New", patch);
    expect(patch.mock.calls[0]?.[0]).toBe(`/api/projects/${project().id}`);
    expect(patch.mock.calls[0]?.[1]?.method).toBe("PATCH");

    const del = respond(200, { ok: true });
    expect(await deleteProjectRequest(project().id, del)).toEqual({ ok: true, data: { ok: true } });
    expect(del.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("maps a non-standard error body and a network failure to a generic message", async () => {
    const bad = await deleteProjectRequest("x", respond(502, "<html>"));
    expect(bad).toEqual({ ok: false, error: { code: "internal", message: "Something went wrong. Please try again." } });

    const offline = await deleteProjectRequest("x", vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("offline"))));
    expect(offline.ok).toBe(false);
  });
});

describe("project tabs", () => {
  const id = project().id;

  it("Knowledge then Install, with Install still the default", () => {
    expect(PROJECT_TABS.map((t) => t.segment)).toEqual(["knowledge", "install"]);
    expect(DEFAULT_PROJECT_TAB.segment).toBe("install");
  });

  it.each([
    [`/dashboard/projects/${id}/install`, "install"],
    [`/dashboard/projects/${id}/install/`, "install"],
    [`/dashboard/projects/${id}`, null],
    [`/dashboard/projects/${id}/installx`, null],
  ])("%s → %s", (path, expected) => {
    expect(getActiveTab(path, id)?.segment ?? null).toBe(expected);
  });

  it("marks the active tab", () => {
    const html = renderToStaticMarkup(<ProjectTabsView projectId={id} activeSegment="install" />);
    expect(html).toContain(`href="${projectTabHref(id, DEFAULT_PROJECT_TAB)}"`);
    expect(html).toContain('aria-current="page"');
  });
});

describe("formatProjectDate", () => {
  it("formats in UTC and keeps an unparseable value", () => {
    expect(formatProjectDate("2026-11-19T23:30:00.000Z")).toBe("Nov 19, 2026");
    expect(formatProjectDate("nope")).toBe("nope");
  });
});
