import { auth } from "@clerk/nextjs/server";
import { applyPlanToConfig, widgetConfigSchema } from "@kivo/shared";
import { CustomizeView } from "@/components/customize/customize-view";
import { loadOwnedProject } from "@/components/projects/load-owned-project";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";
import { createOwnerClient } from "@/lib/supabase/owner";

export default async function CustomizePage({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const project = await loadOwnedProject((await params).id);
  const client = await createOwnerClient();

  const [plan, { data, error }] = await Promise.all([
    getOwnerPlan(async () => client),
    client
      .from("widget_configs")
      .select("button_color, position, label, animation, header_text, show_badge")
      .eq("project_id", project.id)
      .maybeSingle(),
  ]);
  if (error) throw new Error(`Couldn't read the widget config: ${error.message}`);
  if (!data || !plan) throw new Error("Widget config or account plan is unavailable.");

  const config = applyPlanToConfig(widgetConfigSchema.parse(data), plan);
  return <CustomizeView key={project.id} projectId={project.id} plan={plan} config={config} />;
}
