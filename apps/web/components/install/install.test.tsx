import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WIDGET_SCRIPT_PATH } from "@kivo/shared/embed";
import { buildInstallSnippet, copyText, resolveAppOrigin } from "./install-snippet";
import { COPY_FEEDBACK_MS, type CopyStatus, createCopyFeedback } from "./copy-feedback";
import { INSTALL_STEPS, InstallView, SNIPPET_CODE_CLASSES, snippetParts } from "./install-view";
import { SnippetCopyButton } from "./snippet-copy-button";

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ user: { id: "user_a" } }) }));

const KEY = "pk_abcdefgh1234";
const PROJECT = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const req = (h: Record<string, string>) => new Headers(h);

describe("resolveAppOrigin", () => {
  it("uses NEXT_PUBLIC_APP_URL when set (origin only, no trailing slash)", () => {
    const h = req({ host: "preview-abc.vercel.app", "x-forwarded-proto": "https" });
    expect(resolveAppOrigin("https://app.example.com", h)).toBe("https://app.example.com");
    expect(resolveAppOrigin(" https://app.example.com/ ", h)).toBe("https://app.example.com");
    expect(resolveAppOrigin("https://app.example.com/some/path", h)).toBe(
      "https://app.example.com",
    );
  });

  it("falls back to the request origin when the variable is unset or blank", () => {
    const h = req({ host: "kivo-git-branch.vercel.app", "x-forwarded-proto": "https" });
    expect(resolveAppOrigin(undefined, h)).toBe("https://kivo-git-branch.vercel.app");
    expect(resolveAppOrigin("  ", h)).toBe("https://kivo-git-branch.vercel.app");
  });

  it("reads the proto and keeps the port", () => {
    expect(
      resolveAppOrigin(undefined, req({ host: "localhost:3000", "x-forwarded-proto": "http" })),
    ).toBe("http://localhost:3000");
    expect(
      resolveAppOrigin(undefined, req({ host: "a.example", "x-forwarded-proto": "https, http" })),
    ).toBe("https://a.example");
  });

  it("defaults to https without x-forwarded-proto", () => {
    expect(resolveAppOrigin(undefined, req({ host: "a.example" }))).toBe("https://a.example");
  });

  it("is null without a usable origin", () => {
    expect(resolveAppOrigin(undefined, req({}))).toBeNull();
    expect(
      resolveAppOrigin(undefined, req({ host: "a.example", "x-forwarded-proto": "javascript" })),
    ).toBeNull();
    expect(resolveAppOrigin("not a url", req({ host: "a.example" }))).toBeNull();
    expect(resolveAppOrigin("ftp://a.example", req({ host: "a.example" }))).toBeNull();
  });
});

describe("buildInstallSnippet", () => {
  it("uses the origin, the widget path and the project's key", () => {
    expect(WIDGET_SCRIPT_PATH).toBe("/widget.js");
    expect(buildInstallSnippet("https://app.example.com", KEY)).toBe(
      `<script src="https://app.example.com/widget.js" data-key="${KEY}" async></script>`,
    );
  });

  it("uses the env origin when set, else the request origin", () => {
    const h = req({ host: "preview.vercel.app", "x-forwarded-proto": "https" });
    const snippetFor = (env: string | undefined) =>
      buildInstallSnippet(resolveAppOrigin(env, h) ?? "", KEY);
    expect(snippetFor("https://app.example.com")).toContain(
      'src="https://app.example.com/widget.js"',
    );
    expect(snippetFor(undefined)).toContain('src="https://preview.vercel.app/widget.js"');
  });
});

describe("copyText", () => {
  it("writes the exact text", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const snippet = buildInstallSnippet("https://app.example.com", KEY);
    await expect(copyText(snippet, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(snippet);
  });

  it("reports failure", async () => {
    await expect(
      copyText("x", { writeText: () => Promise.reject(new Error("denied")) }),
    ).resolves.toBe(false);
    await expect(copyText("x", undefined)).resolves.toBe(false);
  });
});

/** Every element in a rendered tree, without running client components. */
function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}

describe("InstallView", () => {
  const snippet = buildInstallSnippet("https://app.example.com", KEY);

  it("gives the copy button the exact snippet", () => {
    const buttons = elements(InstallView({ projectId: PROJECT, snippet })).filter(
      (el) => el.type === SnippetCopyButton,
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.props).toEqual({ projectId: PROJECT, text: snippet });
  });

  it("shows the snippet as text, not HTML, and the steps", () => {
    const html = renderToStaticMarkup(<InstallView projectId={PROJECT} snippet={snippet} />);
    expect(html).not.toContain("<script");
    expect(html).toContain('class="ph-no-capture" data-testid="install-snippet"');
    // The visible text is exactly the snippet (what e2e reads and the button copies).
    const code = /data-testid="install-snippet">([\s\S]*?)<\/code>/.exec(html)?.[1] ?? "";
    expect(code.replace(/<[^>]+>/g, "")).toBe(
      "&lt;script src=&quot;https://app.example.com/widget.js&quot; data-key=&quot;pk_abcdefgh1234&quot; async&gt;&lt;/script&gt;",
    );
    expect(INSTALL_STEPS).toEqual(["Copy the snippet", "Paste it before </body>", "Reload your site"]);
    for (const [i, step] of INSTALL_STEPS.entries()) {
      expect(html).toContain(`Step ${i + 1}: </span>${step.replace("<", "&lt;").replace(">", "&gt;")}`);
    }
    expect(html.indexOf("Copy the snippet")).toBeLessThan(html.indexOf("Reload your site"));
    expect(html).toContain('aria-label="Copy install code"');
  });

  it("never wraps the snippet mid-URL or mid-key: wraps at spaces only, else scrolls inside the card", () => {
    const html = renderToStaticMarkup(<InstallView projectId={PROJECT} snippet={snippet} />);
    const pre = /<pre class="([^"]*)"/.exec(html)?.[1]?.split(" ") ?? [];
    expect(pre).toEqual(expect.arrayContaining(["whitespace-pre-wrap", "break-normal", "overflow-x-auto"]));
    expect(pre).not.toContain("break-all");
    expect(pre).not.toContain("break-words");
    expect(SNIPPET_CODE_CLASSES).not.toMatch(/break-(all|words)|wrap-anywhere|wrap-break-word/);
    // Each space-separated part (the src URL, the key) is unbreakable; only the spaces between them wrap.
    expect(snippetParts(snippet)).toEqual([
      "<script",
      'src="https://app.example.com/widget.js"',
      `data-key="${KEY}"`,
      "async></script>",
    ]);
    const spans = [...html.matchAll(/<span class="whitespace-nowrap">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(spans).toHaveLength(4);
    expect(spans[1]).toBe("src=&quot;https://app.example.com/widget.js&quot;");
    const [src, key] = [/src="([^"]+)"/.exec(snippet)?.[1], /data-key="([^"]+)"/.exec(snippet)?.[1]];
    expect(src).toBe("https://app.example.com/widget.js");
    expect(src).not.toMatch(/\s/);
    expect(key).not.toMatch(/\s/);
  });

  it("links Test it to the widget preview (Customize)", () => {
    const html = renderToStaticMarkup(<InstallView projectId={PROJECT} snippet={snippet} />);
    expect(html).toContain(`href="/dashboard/projects/${PROJECT}/customize"`);
    expect(html).toContain("Open the widget preview");
  });

  it("draws the code card dark in both themes", () => {
    const html = renderToStaticMarkup(<InstallView projectId={PROJECT} snippet={snippet} />);
    expect(html).toMatch(/<section[^>]*class="theme-dark [^"]*"/);
  });
});

describe("createCopyFeedback", () => {
  afterEach(() => vi.useRealTimers());

  it("shows Copied, then resets to Copy after 2 s", () => {
    vi.useFakeTimers();
    const set = vi.fn<(status: CopyStatus) => void>();
    const feedback = createCopyFeedback(set);
    expect(COPY_FEEDBACK_MS).toBe(2000);

    feedback.show("copied");
    expect(set).toHaveBeenLastCalledWith("copied");
    vi.advanceTimersByTime(1999);
    expect(set).toHaveBeenLastCalledWith("copied");
    vi.advanceTimersByTime(1);
    expect(set).toHaveBeenLastCalledWith("idle");
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("restarts the countdown on a second copy, and resets a failure too", () => {
    vi.useFakeTimers();
    const set = vi.fn<(status: CopyStatus) => void>();
    const feedback = createCopyFeedback(set);
    feedback.show("copied");
    vi.advanceTimersByTime(1500);
    feedback.show("failed");
    vi.advanceTimersByTime(1500);
    expect(set).toHaveBeenLastCalledWith("failed");
    vi.advanceTimersByTime(500);
    expect(set).toHaveBeenLastCalledWith("idle");
    expect(set.mock.calls.filter(([s]) => s === "idle")).toHaveLength(1);
  });

  it("does nothing after dispose (the button unmounted)", () => {
    vi.useFakeTimers();
    const set = vi.fn<(status: CopyStatus) => void>();
    const feedback = createCopyFeedback(set);
    feedback.show("copied");
    feedback.dispose();
    vi.advanceTimersByTime(5000);
    expect(set).not.toHaveBeenCalledWith("idle");
  });
});

describe("SnippetCopyButton", () => {
  it("starts as Copy with the accessible name e2e uses", () => {
    const html = renderToStaticMarkup(<SnippetCopyButton projectId={PROJECT} text="x" />);
    expect(html).toContain('aria-label="Copy install code"');
    expect(html).toContain(">Copy</span>");
  });
});
