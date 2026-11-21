import { renderToStaticMarkup } from "react-dom/server";
import { type KnowledgeSource, MAX_KNOWLEDGE_FILE_BYTES, type Plan } from "@kivo/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createTextSourceRequest,
  deleteSourceRequest,
  uploadToSignedUrl,
  type UploadXhr,
} from "./knowledge-api";
import { checkFile, FAILED_MESSAGE, sourceCountLabel, statusLabel } from "./knowledge-rules";
import { KnowledgeScreen, type KnowledgeHandlers } from "./knowledge-screen";
import {
  addingDisabled,
  initialKnowledgeState,
  knowledgeReducer,
  type KnowledgeAction,
  type KnowledgeState,
} from "./knowledge-state";
import { uploadFile, type UploadApi } from "./upload-flow";

const PROJECT = "11111111-1111-4111-8111-111111111111";

let n = 0;
const source = (overrides: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id: `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  project_id: PROJECT,
  title: "Shipping policy",
  type: "text",
  storage_key: null,
  status: "ready",
  created_at: "2026-11-21T10:00:00.000Z",
  ...overrides,
});

const noop: KnowledgeHandlers = {
  onPasteTitleChange: () => {},
  onPasteContentChange: () => {},
  onPasteSubmit: () => {},
  onFileChosen: () => {},
  onDeleteOpen: () => {},
  onDeleteConfirm: () => {},
  onDeleteClose: () => {},
  onRefresh: () => {},
};

const state = (sources: KnowledgeSource[], plan: Plan = "free") =>
  initialKnowledgeState(sources, plan);
const run = (s: KnowledgeState, ...actions: KnowledgeAction[]) =>
  actions.reduce(knowledgeReducer, s);
const render = (s: KnowledgeState) =>
  renderToStaticMarkup(<KnowledgeScreen state={s} handlers={noop} />);

const PLAN_LIMIT = {
  code: "plan_limit",
  message: "Your plan's knowledge source limit is reached.",
} as const;

describe("source list", () => {
  it("lists title, type and status, in the given (newest-first) order", () => {
    const html = render(
      state([
        source({ title: "Returns", type: "pdf", status: "ready" }),
        source({ title: "FAQ", type: "md", status: "processing" }),
      ]),
    );
    expect(html.indexOf("Returns")).toBeLessThan(html.indexOf("FAQ"));
    expect(html).toContain("PDF");
    expect(html).toContain("Markdown");
    expect(html).toMatch(/data-status="ready"[^>]*>Ready</);
    expect(html).toMatch(/data-status="processing"[^>]*>Processing</);
    expect(html).not.toContain("No knowledge yet");
  });

  it("shows `uploading` as Processing", () => {
    expect(statusLabel("uploading")).toBe("Processing");
    expect(render(state([source({ type: "pdf", status: "uploading" })]))).toMatch(
      /data-status="uploading"[^>]*>Processing</,
    );
  });

  it("shows the failed message on a failed source only", () => {
    const html = render(
      state([source({ status: "failed", title: "Bad" }), source({ title: "Good" })]),
    );
    expect(html).toContain(FAILED_MESSAGE.replace("'", "&#x27;"));
    expect(html.match(/data-testid="source-failed"/g)).toHaveLength(1);
    expect(FAILED_MESSAGE).toBe("Couldn't read this file. Delete it and try again.");
  });

  it("renders titles as text, never HTML", () => {
    const html = render(state([source({ title: '<img src=x onerror="alert(1)">' })]));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("empty state with both add forms", () => {
    const html = render(state([]));
    expect(html).toContain("No knowledge yet");
    expect(html).toContain('id="knowledge-paste-title"');
    expect(html).toContain('id="knowledge-file"');
    expect(html).toContain("0 of 3 sources");
  });

  it("has a Refresh button", () => {
    expect(render(state([]))).toMatch(/<button[^>]*>Refresh<\/button>/);
  });
});

describe("limit", () => {
  it("shows N of M from the plan", () => {
    expect(sourceCountLabel("free", 2)).toBe("2 of 3 sources");
    expect(sourceCountLabel("pro", 4)).toBe("4 of 25 sources");
  });

  it("Free at 3 sources: adding disabled + upgrade link to billing", () => {
    const s = state([source(), source(), source()], "free");
    expect(addingDisabled(s)).toBe(true);
    const html = render(s);
    expect(html).toContain("3 of 3 sources");
    expect(html).toContain("Free includes 3 sources per project. Pro includes 25.");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toMatch(/<input[^>]*id="knowledge-paste-title"[^>]*disabled=""/);
    expect(html).toMatch(/<textarea[^>]*id="knowledge-paste-content"[^>]*disabled=""/);
    expect(html).toMatch(/<input[^>]*id="knowledge-file"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add text/);
  });

  it("Free under the limit: no upgrade message, adding enabled", () => {
    const html = render(state([source()], "free"));
    expect(html).not.toContain('data-testid="source-limit"');
    expect(html).not.toMatch(/<input[^>]*id="knowledge-file"[^>]*disabled=""/);
  });

  it("Pro at 25: the limit message, no upgrade link", () => {
    const html = render(
      state(
        Array.from({ length: 25 }, () => source()),
        "pro",
      ),
    );
    expect(html).toContain("Pro includes 25 sources per project. Delete one to add another.");
    expect(html).not.toContain('href="/dashboard/billing"');
  });

  it("a 403 plan_limit from the server (paste) shows the upgrade message and disables adding", () => {
    const s = run(
      state([source()], "free"),
      { type: "pasteStarted" },
      { type: "pasteFailed", error: PLAN_LIMIT },
    );
    expect(s.limitFromServer).toBe(true);
    expect(s.pasteError).toBeNull();
    expect(addingDisabled(s)).toBe(true);
    expect(render(s)).toContain('href="/dashboard/billing"');
  });

  it("a 403 plan_limit from the server (upload) does the same", () => {
    const s = run(
      state([], "free"),
      { type: "uploadStarted", fileName: "a.pdf" },
      { type: "uploadFailed", error: PLAN_LIMIT },
    );
    expect(addingDisabled(s)).toBe(true);
    expect(s.upload.phase).toBe("idle");
  });

  it("deleting a source, or a refresh, clears the server's limit flag", () => {
    const at = run(state([source()], "free"), { type: "pasteFailed", error: PLAN_LIMIT });
    const kept = at.sources[0];
    if (!kept) throw new Error("no source");
    expect(
      addingDisabled(
        run(at, { type: "deleteOpened", source: kept }, { type: "deleteSucceeded", id: kept.id }),
      ),
    ).toBe(false);
    expect(addingDisabled(run(at, { type: "serverSynced", sources: [], plan: "free" }))).toBe(
      false,
    );
  });
});

describe("paste", () => {
  it("submits title and text to POST /api/projects/:id/knowledge", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ source: source({ status: "processing" }) }, { status: 201 }),
    );
    const result = await createTextSourceRequest(
      PROJECT,
      { title: "Hours", content: "9 to 5" },
      fetchMock,
    );
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/api/projects/${PROJECT}/knowledge`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Hours", content: "9 to 5" });
  });

  it("success adds the new source on top as Processing and clears the form", () => {
    const added = source({ title: "Hours", status: "processing" });
    const s = run(
      state([source({ title: "Old" })]),
      { type: "pasteTitleChanged", title: "Hours" },
      { type: "pasteContentChanged", content: "9 to 5" },
      { type: "pasteStarted" },
      { type: "pasteSucceeded", source: added },
    );
    expect(s.sources.map((x) => x.title)).toEqual(["Hours", "Old"]);
    expect([s.pasteTitle, s.pasteContent, s.pending]).toEqual(["", "", null]);
    expect(render(s)).toMatch(/Hours[\s\S]*Processing/);
  });

  it("shows the server's error message", () => {
    const s = run(state([]), {
      type: "pasteFailed",
      error: { code: "invalid_input", message: "Send a title." },
    });
    expect(render(s)).toContain("Send a title.");
  });

  it("Add text is disabled until both fields have text", () => {
    expect(render(state([]))).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add text/);
    const filled = run(
      state([]),
      { type: "pasteTitleChanged", title: "T" },
      { type: "pasteContentChanged", content: "x" },
    );
    expect(render(filled)).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add text/);
  });
});

describe("checkFile (in the browser, before asking)", () => {
  it.each([
    [
      "over 10 MB",
      { name: "big.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1 },
      "Files can be up to 10 MB.",
    ],
    [
      "a .docx",
      { name: "guide.docx", size: 1000 },
      "Choose a PDF, Markdown (.md) or text (.txt) file.",
    ],
    [
      "an .exe",
      { name: "setup.exe", size: 1000 },
      "Choose a PDF, Markdown (.md) or text (.txt) file.",
    ],
    [
      "no extension",
      { name: "README", size: 1000 },
      "Choose a PDF, Markdown (.md) or text (.txt) file.",
    ],
    ["empty", { name: "a.txt", size: 0 }, "This file is empty."],
  ])("refuses %s", (_, file, message) => {
    expect(checkFile(file)).toEqual({ error: message });
  });

  it.each([
    ["guide.pdf", "pdf", "application/pdf"],
    ["NOTES.MD", "md", "text/markdown"],
    ["faq.txt", "txt", "text/plain"],
  ])("accepts %s with the MIME type Storage expects", (name, type, contentType) => {
    expect(checkFile({ name, size: MAX_KNOWLEDGE_FILE_BYTES })).toEqual({
      type,
      contentType,
      title: name,
    });
  });

  it("keeps the title within 200 characters", () => {
    const result = checkFile({ name: `${"a".repeat(250)}.pdf`, size: 10 });
    expect("title" in result && result.title.length).toBe(200);
  });
});

/** Fake API for the upload flow; records the calls. */
function fakeUploadApi(overrides: Partial<UploadApi> = {}) {
  const calls: string[] = [];
  const reserved = source({ type: "pdf", status: "uploading", storage_key: `${PROJECT}/x.pdf` });
  const api: UploadApi = {
    createUploadUrl: vi.fn(async (_p, body) => {
      calls.push(`upload-url ${body.fileName} ${body.contentType} ${body.fileSize}`);
      return {
        ok: true as const,
        data: {
          source: reserved,
          upload: { signedUrl: "https://storage.test/sign?token=t", token: "t", path: "x" },
        },
      };
    }),
    upload: vi.fn(async (url, _file, contentType, onProgress) => {
      calls.push(`PUT ${url} ${contentType}`);
      onProgress(0.5);
      onProgress(1);
      return { ok: true as const, data: null };
    }),
    finalize: vi.fn(async (_p, body) => {
      calls.push(`finalize ${body.sourceId}`);
      return {
        ok: true as const,
        data: { source: { ...reserved, status: "processing" as const } },
      };
    }),
    deleteSource: vi.fn(async (id) => {
      calls.push(`delete ${id}`);
      return { ok: true as const, data: { ok: true as const } };
    }),
    ...overrides,
  };
  return { api, calls, reserved };
}

const file = (name: string, size: number, type = "") =>
  new File([new Uint8Array(Math.min(size, 16))], name, { type }) as File & { size: number };

/** A File whose `size` is `size` without allocating it. */
const sized = (name: string, size: number) => {
  const f = file(name, 1);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("upload flow", () => {
  it("a file over 10 MB or of the wrong type never reaches the server", async () => {
    for (const f of [sized("big.pdf", MAX_KNOWLEDGE_FILE_BYTES + 1), file("guide.docx", 10)]) {
      const { api, calls } = fakeUploadApi();
      const actions: KnowledgeAction[] = [];
      await uploadFile(PROJECT, f, (a) => actions.push(a), api);
      expect(calls).toEqual([]);
      expect(actions).toHaveLength(1);
      expect(actions[0]?.type).toBe("fileRejected");
    }
  });

  it("upload-url → PUT to the signed URL (with progress) → finalize → Processing", async () => {
    const { api, calls, reserved } = fakeUploadApi();
    let s = state([]);
    // A .md often has no browser MIME type; the extension decides.
    await uploadFile(PROJECT, file("notes.md", 10, ""), (a) => (s = knowledgeReducer(s, a)), api);
    expect(calls).toEqual([
      "upload-url notes.md text/markdown 10",
      "PUT https://storage.test/sign?token=t text/markdown",
      `finalize ${reserved.id}`,
    ]);
    expect(s.sources[0]?.status).toBe("processing");
    expect(s.upload.phase).toBe("idle");
    expect(s.pending).toBeNull();
  });

  it("shows progress while uploading", () => {
    const s = run(
      state([]),
      { type: "uploadStarted", fileName: "guide.pdf" },
      { type: "uploadProgressed", progress: 0.42 },
    );
    const html = render(s);
    expect(html).toContain("Uploading… 42%");
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toMatch(/<input[^>]*id="knowledge-file"[^>]*disabled=""/);
  });

  it("a refusal at finalize shows the server's message", async () => {
    const { api } = fakeUploadApi({
      finalize: async () => ({
        ok: false as const,
        error: {
          code: "invalid_input" as const,
          message: "The file is not a PDF. The file was removed.",
        },
      }),
    });
    let s = state([]);
    await uploadFile(PROJECT, file("fake.pdf", 10), (a) => (s = knowledgeReducer(s, a)), api);
    expect(s.sources).toEqual([]);
    expect(render(s)).toContain("The file is not a PDF. The file was removed.");
  });

  it("a failed PUT deletes the reserved source and shows an error", async () => {
    const { api, calls, reserved } = fakeUploadApi({
      upload: async () => ({
        ok: false as const,
        error: { code: "internal" as const, message: "The upload didn't finish." },
      }),
    });
    let s = state([]);
    await uploadFile(PROJECT, file("a.pdf", 10), (a) => (s = knowledgeReducer(s, a)), api);
    expect(calls).toContain(`delete ${reserved.id}`);
    expect(calls.some((c) => c.startsWith("finalize"))).toBe(false);
    expect(s.uploadError).toBe("The upload didn't finish.");
    expect(s.sources).toEqual([]);
  });

  it("keeps the unfinished source available for deletion when upload cleanup fails", async () => {
    const error = { code: "internal" as const, message: "Couldn't reach the server." };
    const { api, reserved } = fakeUploadApi({
      upload: async () => ({ ok: false, error }),
      deleteSource: async () => ({ ok: false, error }),
    });
    let s = state([]);
    await uploadFile(PROJECT, file("a.pdf", 10), (a) => (s = knowledgeReducer(s, a)), api);
    const html = render(s);
    expect(s.sources).toEqual([reserved]);
    expect(s.pending).toBeNull();
    expect(html).toContain("Delete the unfinished source below and try again.");
    expect(html).toContain(`aria-label="Delete ${reserved.title}"`);
  });

  it("uploadToSignedUrl PUTs the raw file with its content type and reports progress", async () => {
    const opened: string[] = [];
    const headers: Record<string, string> = {};
    const progress: number[] = [];
    type FakeXhr = {
      status: number;
      upload: { onprogress: ((event: ProgressEvent) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      onabort: (() => void) | null;
      open: (method: string, url: string) => void;
      setRequestHeader: (name: string, value: string) => void;
      send: () => void;
    };
    const xhr: FakeXhr = {
      status: 200,
      upload: { onprogress: null },
      onload: null,
      onerror: null,
      onabort: null,
      open: (method, url) => {
        opened.push(`${method} ${url}`);
      },
      setRequestHeader: (name, value) => {
        headers[name] = value;
      },
      send: () => {
        xhr.upload.onprogress?.({ loaded: 5, total: 10, lengthComputable: true } as ProgressEvent);
        xhr.onload?.();
      },
    };
    const result = await uploadToSignedUrl(
      "https://storage.test/sign?token=t",
      new Blob(["x"]),
      "application/pdf",
      (f) => progress.push(f),
      () => xhr as unknown as UploadXhr,
    );
    expect(result.ok).toBe(true);
    expect(opened).toEqual(["PUT https://storage.test/sign?token=t"]);
    expect(headers).toEqual({ "Content-Type": "application/pdf" });
    expect(progress).toEqual([0.5]);
  });
});

describe("delete", () => {
  it("asks for confirmation: opening only shows the dialog", () => {
    const target = source({ title: "Returns" });
    const s = run(state([target]), { type: "deleteOpened", source: target });
    expect(s.sources).toHaveLength(1);
    const html = render(s);
    expect(html).toContain("Delete source?");
    expect(html).toContain("Returns");
    expect(html).toContain("Delete source</button>");
    expect(html).toContain("Cancel");
  });

  it("cancel closes it and keeps the source", () => {
    const target = source();
    const s = run(
      state([target]),
      { type: "deleteOpened", source: target },
      { type: "deleteClosed" },
    );
    expect(s.deleting).toBeNull();
    expect(s.sources).toHaveLength(1);
  });

  it("can't close while the request runs", () => {
    const target = source();
    const s = run(
      state([target]),
      { type: "deleteOpened", source: target },
      { type: "deleteStarted" },
      { type: "deleteClosed" },
    );
    expect(s.deleting).not.toBeNull();
  });

  it("confirm removes it; a failure shows the error in the dialog", () => {
    const target = source();
    const opened = run(
      state([target]),
      { type: "deleteOpened", source: target },
      { type: "deleteStarted" },
    );
    expect(run(opened, { type: "deleteSucceeded", id: target.id }).sources).toEqual([]);
    const failed = run(opened, {
      type: "deleteFailed",
      error: { code: "internal", message: "Try again." },
    });
    expect(render(failed)).toContain("Try again.");
    expect(failed.sources).toHaveLength(1);
  });

  it("calls DELETE /api/knowledge/:id", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    await deleteSourceRequest("abc", fetchMock);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/knowledge/abc");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});

describe("refresh", () => {
  it("takes the server's statuses and keeps typed text", () => {
    const pending = source({ status: "processing" });
    const s = run(
      state([pending]),
      { type: "pasteTitleChanged", title: "Draft" },
      {
        type: "serverSynced",
        sources: [{ ...pending, status: "ready" }],
        plan: "free",
      },
    );
    expect(s.sources[0]?.status).toBe("ready");
    expect(s.pasteTitle).toBe("Draft");
  });
});
