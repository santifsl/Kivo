import "server-only";
import {
  type UpdateWidgetConfigRequest,
  type WidgetConfig,
  widgetAnimationSchema,
  widgetPositionSchema,
} from "@kivo/shared";
import type { ServiceClient } from "../supabase/service";

/** Save validated fields after the route has checked ownership and plan. */
export async function updateWidgetConfig(
  client: ServiceClient,
  projectId: string,
  config: UpdateWidgetConfigRequest,
): Promise<WidgetConfig | null> {
  const { data, error } = await client
    .from("widget_configs")
    .update(config)
    .eq("project_id", projectId)
    .select("button_color, position, label, animation, header_text, show_badge")
    .maybeSingle();

  if (error) throw new Error(`Couldn't save the widget config: ${error.message}`);
  if (!data) return null;

  return {
    ...data,
    position: widgetPositionSchema.parse(data.position),
    animation: widgetAnimationSchema.parse(data.animation),
  };
}
