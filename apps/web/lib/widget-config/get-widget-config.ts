import "server-only";
import {
  applyPlanToConfig,
  DEFAULT_WIDGET_CONFIG,
  planSchema,
  widgetConfigSchema,
  type Plan,
  type WidgetConfig,
} from "@kivo/shared";
import { createServiceClient, type ServiceClient } from "../supabase/service";

/** Columns of `widget_configs` the widget needs (never `project_id`). */
const CONFIG_COLUMNS = "button_color, position, label, animation, header_text, show_badge";

/**
 * The plan-applied widget config for a project's public key, or `null` if no
 * project has that key.
 *
 * Public route, no owner: the key only identifies the project
 * (docs/project.md §9 "Public key abuse"), so this uses the service client and
 * returns nothing but the config. The owner's plan is read on the server and
 * applied here; it never leaves this function.
 *
 * Fails safe: a missing or invalid config row gives the defaults, and an
 * unknown plan value counts as Free. Throws on a database error.
 */
export async function getWidgetConfig(
  publicKey: string,
  client: ServiceClient = createServiceClient(),
): Promise<WidgetConfig | null> {
  const { data, error } = await client
    .from("projects")
    .select(`widget_configs(${CONFIG_COLUMNS}), accounts(plan)`)
    .eq("public_key", publicKey)
    .maybeSingle();

  if (error) throw new Error(`Couldn't read the widget config: ${error.message}`);
  if (!data) return null;

  return applyPlanToConfig(storedConfig(data.widget_configs), ownerPlan(data.accounts));
}

function storedConfig(row: unknown): WidgetConfig {
  if (row === null) {
    console.warn("[widget-config] Project has no widget_configs row; using the defaults.");
    return DEFAULT_WIDGET_CONFIG;
  }
  const parsed = widgetConfigSchema.safeParse(row);
  if (!parsed.success) {
    console.error("[widget-config] Stored config is invalid; using the defaults.");
    return DEFAULT_WIDGET_CONFIG;
  }
  return parsed.data;
}

function ownerPlan(row: { plan: string } | null): Plan {
  const parsed = planSchema.safeParse(row?.plan);
  if (!parsed.success) {
    console.error("[widget-config] Owner's plan is missing or unknown; treating it as free.");
    return "free";
  }
  return parsed.data;
}
