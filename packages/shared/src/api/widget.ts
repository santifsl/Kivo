import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "../limits";
import type { WidgetConfig } from "../widget";
import { idSchema, publicKeySchema } from "./common";

// Public routes, called by the widget from any origin. docs/project.md §8.

/** GET /api/widget/config — query. */
export const widgetConfigQuerySchema = z.strictObject({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;

/** GET /api/widget/config — response: the plan-applied config. */
export interface WidgetConfigResponse {
  config: WidgetConfig;
}

export const VISITOR_ID_MAX_LENGTH = 64;

/** POST /api/widget/chat — body. */
export const chatRequestSchema = z.strictObject({
  key: publicKeySchema,
  visitorId: z.string().trim().min(1).max(VISITOR_ID_MAX_LENGTH),
  conversationId: idSchema.optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** POST /api/widget/chat — response. */
export interface ChatResponse {
  conversationId: string;
  reply: string;
}
