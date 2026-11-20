import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WIDGET_SCRIPT_PATH } from "@kivo/shared/embed";
import { buildInstallSnippet, copyText, resolveAppOrigin } from "./install-snippet";
import { INSTALL_STEPS, InstallView } from "./install-view";
import { SnippetCopyButton } from "./snippet-copy-button";

const KEY = "pk_abcdefgh1234";
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
    const buttons = elements(InstallView({ snippet })).filter(
      (el) => el.type === SnippetCopyButton,
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.props).toEqual({ text: snippet });
  });

  it("shows the snippet as text, not HTML, and the steps", () => {
    const html = renderToStaticMarkup(<InstallView snippet={snippet} />);
    expect(html).not.toContain("<script");
    expect(html).toContain(
      "&lt;script src=&quot;https://app.example.com/widget.js&quot; data-key=&quot;pk_abcdefgh1234&quot; async&gt;&lt;/script&gt;",
    );
    expect(INSTALL_STEPS).toEqual([
      "Copy the code.",
      "Paste it before </body> on every page.",
      "Reload the page; the chat button appears in the corner.",
    ]);
    expect(html).toContain("Paste it before &lt;/body&gt; on every page.");
    expect(html).toContain('aria-label="Copy install code"');
  });
});
