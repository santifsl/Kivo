import { z } from "zod";
import type { Plan } from "../enums";
import { type WidgetConfig, widgetConfigSchema } from "../widget";
import type { OkResponse } from "../errors";
import type { Timestamp } from "./common";

// Owner routes: projects and their widget config. docs/project.md §8.

export const PROJECT_NAME_MAX_LENGTH = 80;
export const projectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

/** A project, as owner routes return it (`projects` row, §7). */
export interface Project {
  id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: Timestamp;
  created_at: Timestamp;
}

/** GET /api/projects — response. `plan` lets the dashboard show usage against PLAN_LIMITS. */
export interface ListProjectsResponse {
  projects: Project[];
  plan: Plan;
}

/** POST /api/projects — body. */
export const createProjectRequestSchema = z.strictObject({ name: projectNameSchema });
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

/** POST /api/projects — response. */
export interface CreateProjectResponse {
  project: Project;
}

/** PATCH /api/projects/:id — body (rename only). Params: `idParamsSchema`. */
export const updateProjectRequestSchema = z.strictObject({ name: projectNameSchema });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

/** PATCH /api/projects/:id — response. */
export interface UpdateProjectResponse {
  project: Project;
}

/** DELETE /api/projects/:id — params: `idParamsSchema`; response. */
export type DeleteProjectResponse = OkResponse;

/** PATCH /api/projects/:id/config — body: any subset of the config. 402 on Free. */
export const updateWidgetConfigRequestSchema = widgetConfigSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Send at least one field");
export type UpdateWidgetConfigRequest = z.infer<typeof updateWidgetConfigRequestSchema>;

/** PATCH /api/projects/:id/config — response: the saved config. */
export interface UpdateWidgetConfigResponse {
  config: WidgetConfig;
}
