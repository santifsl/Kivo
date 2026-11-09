/**
 * Shared contract for the web app and the widget: plans, limits, widget
 * config, error shape, and the zod schema + type for every API route.
 * Changes here are contract changes — the lead plans them and the PO approves.
 */
export * from "./app";
export * from "./enums";
export * from "./plans";
export * from "./limits";
export * from "./widget";
export * from "./errors";
export * from "./api";
