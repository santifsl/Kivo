import type { PGlite } from "@electric-sql/pglite";

export const TABLES = [
  "accounts",
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;
export type TableName = (typeof TABLES)[number];

/** A `vector(1536)` literal with every component set to `value`. */
export function vec(value: number): string {
  return `[${Array.from({ length: 1536 }, () => value).join(",")}]`;
}

export interface OwnerRows {
  sub: string;
  projectId: string;
  sourceId: string;
  chunkId: string;
  conversationId: string;
  messageId: string;
}

/**
 * Seed one owner with a row in every table, as `postgres` (bypasses RLS).
 * `n` keeps public keys unique across owners.
 */
export async function seedOwner(db: PGlite, sub: string, n: number): Promise<OwnerRows> {
  await db.query("insert into public.accounts (clerk_user_id) values ($1)", [sub]);
  const one = async (sql: string, params: unknown[]): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(sql, params);
    const id = rows[0]?.id;
    if (!id) throw new Error(`seed failed: ${sql}`);
    return id;
  };
  const projectId = await one(
    "insert into public.projects (owner_id, name, public_key) values ($1, $2, $3) returning id",
    [sub, `Project ${n}`, `pk_test_owner_${n}`],
  );
  await db.query(
    `insert into public.widget_configs
       (project_id, button_color, position, label, animation, header_text, show_badge)
     values ($1, '#000000', 'bottom-right', 'Chat', 'fade', 'How can we help?', true)`,
    [projectId],
  );
  const sourceId = await one(
    `insert into public.knowledge_sources (project_id, title, type, status)
     values ($1, 'FAQ', 'text', 'ready') returning id`,
    [projectId],
  );
  const chunkId = await one(
    `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
     values ($1, $2, 'Hello', $3) returning id`,
    [projectId, sourceId, vec(n / 10)],
  );
  const conversationId = await one(
    "insert into public.conversations (project_id, visitor_id) values ($1, 'visitor-1') returning id",
    [projectId],
  );
  const messageId = await one(
    `insert into public.messages (conversation_id, role, body)
     values ($1, 'visitor', 'Hi') returning id`,
    [conversationId],
  );
  return { sub, projectId, sourceId, chunkId, conversationId, messageId };
}

/** Insert SQL with valid values for each table, for permission checks. */
export function validInsert(table: TableName, a: OwnerRows): { sql: string; params: unknown[] } {
  switch (table) {
    case "accounts":
      return { sql: "insert into public.accounts (clerk_user_id) values ('user_new')", params: [] };
    case "projects":
      return {
        sql: "insert into public.projects (owner_id, name, public_key) values ($1, 'New', 'pk_test_new_project')",
        params: [a.sub],
      };
    case "widget_configs":
      // The owner's project already has a config, so use a fresh id; the
      // permission check fires before the foreign key check.
      return {
        sql: `insert into public.widget_configs
                (project_id, button_color, position, label, animation, header_text, show_badge)
              values (gen_random_uuid(), '#000000', 'bottom-right', 'Chat', 'fade', 'Hi', true)`,
        params: [],
      };
    case "knowledge_sources":
      return {
        sql: "insert into public.knowledge_sources (project_id, title, type, status) values ($1, 'T', 'text', 'ready')",
        params: [a.projectId],
      };
    case "knowledge_chunks":
      return {
        sql: "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'x', $3)",
        params: [a.projectId, a.sourceId, vec(0.5)],
      };
    case "conversations":
      return {
        sql: "insert into public.conversations (project_id, visitor_id) values ($1, 'v')",
        params: [a.projectId],
      };
    case "messages":
      return {
        sql: "insert into public.messages (conversation_id, role, body) values ($1, 'bot', 'x')",
        params: [a.conversationId],
      };
  }
}
