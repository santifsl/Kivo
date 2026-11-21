import "server-only";
import OpenAI from "openai";
import { requireEnv } from "../supabase/env";

/**
 * OpenAI client with the server's API key. Server only: the key never reaches
 * a client bundle (docs/project.md §9 "Secrets").
 *
 * This is the only file that reads OPENAI_API_KEY (a test enforces it).
 */
export function createOpenAIClient(): OpenAI {
  const apiKey = requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  return new OpenAI({ apiKey });
}
