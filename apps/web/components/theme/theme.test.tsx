import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  isUnthemedPath,
  forgetUnsavedChoice,
  parseThemeChoice,
  readThemeChoice,
  resolveTheme,
  setThemeChoice,
} from "./theme";
import { THEME_SCRIPT } from "./theme-script";
import { ThemeSwitchView } from "./theme-switch";

/** A minimal <html>: classList, style and attributes. */
function fakeRoot() {
  const classes = new Set<string>(["font-vars"]);
  const attributes: Record<string, string> = {};
  return {
    classes,
    attributes,
    style: { colorScheme: "" },
    classList: {
      add: (c: string) => void classes.add(c),
      remove: (c: string) => void classes.delete(c),
    },
    setAttribute: (name: string, value: string) => void (attributes[name] = value),
  };
}

/** Runs the real inline script against a fake page. */
function runScript({
  stored,
  systemDark = false,
  pathname = "/dashboard",
  storageThrows = false,
}: {
  stored?: string | null;
  systemDark?: boolean;
  pathname?: string;
  storageThrows?: boolean;
}) {
  const root = fakeRoot();
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("blocked");
      return key === THEME_STORAGE_KEY ? (stored ?? null) : null;
    },
  };
  const matchMedia = vi.fn(() => ({ matches: systemDark }));
  const window = { matchMedia };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("document", "location", "localStorage", "matchMedia", "window", THEME_SCRIPT)(
    { documentElement: root },
    { pathname },
    localStorage,
    matchMedia,
    window,
  );
  return root;
}

const themeClass = (root: ReturnType<typeof fakeRoot>) =>
  [...root.classes].filter((c) => c === "light" || c === "dark");

describe("theme resolution", () => {
  it("parses stored values; unknown or missing means System", () => {
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice(null)).toBe("system");
    expect(parseThemeChoice("purple")).toBe("system");
  });

  it("System follows the OS; Light and Dark ignore it", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("only /embed (and below) is unthemed", () => {
    expect(isUnthemedPath("/embed")).toBe(true);
    expect(isUnthemedPath("/embed/x")).toBe(true);
    expect(isUnthemedPath("/embedded")).toBe(false);
    expect(isUnthemedPath("/dashboard")).toBe(false);
    expect(isUnthemedPath("/")).toBe(false);
  });

  it("applyTheme swaps the class and sets color-scheme", () => {
    const root = fakeRoot();
    applyTheme(root as unknown as HTMLElement, "dark");
    expect(themeClass(root)).toEqual(["dark"]);
    applyTheme(root as unknown as HTMLElement, "light");
    expect(themeClass(root)).toEqual(["light"]);
    expect(root.style.colorScheme).toBe("light");
    expect(root.classes.has("font-vars")).toBe(true);
  });
});

describe("inline theme script (stored value → class on <html>, before paint)", () => {
  it.each([
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["system", true, "dark"],
    ["system", false, "light"],
    [null, true, "dark"],
    [null, false, "light"],
    ["garbage", true, "dark"],
  ] as const)("stored %s, OS dark %s → %s", (stored, systemDark, expected) => {
    const root = runScript({ stored, systemDark });
    expect(themeClass(root)).toEqual([expected]);
    expect(root.style.colorScheme).toBe(expected);
  });

  it("blocked storage falls back to System", () => {
    expect(themeClass(runScript({ storageThrows: true, systemDark: true }))).toEqual(["dark"]);
  });

  it("on /embed, adds no theme class and marks the embed surface", () => {
    const root = runScript({ stored: "dark", pathname: "/embed" });
    expect(themeClass(root)).toEqual([]);
    expect(root.attributes["data-surface"]).toBe("embed");
  });

  it("themes the landing page's <html> too (the landing markup forces dark itself)", () => {
    const root = runScript({ stored: "light", pathname: "/" });
    expect(themeClass(root)).toEqual(["light"]);
    expect(root.attributes["data-surface"]).toBeUndefined();
  });
});

describe("ThemeSwitchView", () => {
  const html = (value: "light" | "dark" | "system") =>
    renderToStaticMarkup(<ThemeSwitchView value={value} onChange={() => {}} />);

  it("is a labelled group of native radios (arrow keys, one tab stop), each with an icon", () => {
    const out = html("system");
    expect(out).toMatch(/^<fieldset /);
    expect(out).toMatch(/<legend[^>]*>Theme<\/legend>/);
    const radios = out.match(/<input [^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    const names = new Set(radios.map((r) => /name="([^"]+)"/.exec(r)?.[1]));
    expect(names.size).toBe(1); // one group: the browser moves between them with arrow keys
    for (const label of ["Light", "Dark", "System"]) {
      expect(out).toMatch(new RegExp(`type="radio"[^>]*aria-label="${label}"`));
    }
    expect(out.match(/<svg/g)).toHaveLength(3);
  });

  it.each(["light", "dark", "system"] as const)("checks only %s", (value) => {
    const out = html(value);
    expect(out.match(/checked=""/g)).toHaveLength(1);
    const checked = (out.match(/<input [^>]*>/g) ?? []).filter((tag) => tag.includes('checked=""'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(`value="${value}"`);
  });
});

describe("setThemeChoice (what ThemeSwitch calls)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function page(pathname = "/dashboard", systemDark = false) {
    const store = new Map<string, string>();
    const root = fakeRoot();
    const events: string[] = [];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      matchMedia: () => ({ matches: systemDark }),
      location: { pathname },
      dispatchEvent: (e: Event) => void events.push(e.type),
    });
    vi.stubGlobal("document", { documentElement: root });
    return { store, root, events };
  }

  it("saves the choice, applies it to <html> and tells listeners", () => {
    const { store, root, events } = page();
    setThemeChoice("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(themeClass(root)).toEqual(["dark"]);
    expect(events).toEqual([THEME_CHANGE_EVENT]);
    setThemeChoice("light");
    expect(themeClass(root)).toEqual(["light"]);
  });

  it("System applies the OS preference", () => {
    const { root } = page("/dashboard", true);
    setThemeChoice("system");
    expect(themeClass(root)).toEqual(["dark"]);
  });

  it("blocked storage: the choice is kept in memory, so the switch and page follow it", () => {
    const { root } = page();
    const blocked = () => {
      throw new Error("blocked");
    };
    (window as unknown as { localStorage: object }).localStorage = {
      getItem: blocked,
      setItem: blocked,
    };
    setThemeChoice("dark");
    expect(readThemeChoice()).toBe("dark");
    expect(themeClass(root)).toEqual(["dark"]);
    setThemeChoice("light");
    expect(readThemeChoice()).toBe("light");
    expect(themeClass(root)).toEqual(["light"]);
    forgetUnsavedChoice();
    expect(readThemeChoice()).toBe("system");
  });

  it("never themes /embed", () => {
    const { store, root } = page("/embed");
    setThemeChoice("dark");
    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(themeClass(root)).toEqual([]);
  });
});
