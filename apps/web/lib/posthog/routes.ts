import { normalizePath, WIDGET_PREFIXES } from "../auth/routes";

export function isWidgetPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return WIDGET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function canRecordReplay(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/" || path === "/dashboard" || path.startsWith("/dashboard/");
}
