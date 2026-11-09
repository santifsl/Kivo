import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { TABLES, type OwnerRows, seedOwner, validInsert, vec } from "./fixtures";

let s: SupabasePglite;
let a: OwnerRows;
let b: OwnerRows;

beforeEach(async () => {
  s = await createSupabasePglite();
  a = await seedOwner(s.db, "user_a", 1);
  b = await seedOwner(s.db, "user_b", 2);
});

afterEach(async () => {
  await s.close();
});

/** Rows `sub` can see in each table, by key, as the authenticated role. */
async function visibleKeys(sub: string | null): Promise<Record<string, string[]>> {
  return s.as("authenticated", sub, async (tx) => {
    const keys = async (sql: string) => (await tx.query<{ k: string }>(sql)).rows.map((r) => r.k);
    return {
      accounts: await keys("select clerk_user_id as k from public.accounts"),
      projects: await keys("select id as k from public.projects"),
      widget_configs: await keys("select project_id as k from public.widget_configs"),
      knowledge_sources: await keys("select id as k from public.knowledge_sources"),
      knowledge_chunks: await keys("select id as k from public.knowledge_chunks"),
      conversations: await keys("select id as k from public.conversations"),
      messages: await keys("select id as k from public.messages"),
    };
  });
}

function expectedKeys(o: OwnerRows): Record<string, string[]> {
  return {
    accounts: [o.sub],
    projects: [o.projectId],
    widget_configs: [o.projectId],
    knowledge_sources: [o.sourceId],
    knowledge_chunks: [o.chunkId],
    conversations: [o.conversationId],
    messages: [o.messageId],
  };
}

describe("tenant isolation", () => {
  it("owner A sees only their own rows in every table", async () => {
    expect(await visibleKeys(a.sub)).toEqual(expectedKeys(a));
  });

  it("owner B sees only their own rows in every table", async () => {
    expect(await visibleKeys(b.sub)).toEqual(expectedKeys(b));
  });

  it("an authenticated token without a sub sees nothing", async () => {
    const empty = Object.fromEntries(TABLES.map((t) => [t, []]));
    expect(await visibleKeys(null)).toEqual(empty);
  });
});

describe("anon", () => {
  it.each(TABLES)("can't select from %s", async (table) => {
    await expect(
      s.as("anon", null, (tx) => tx.query(`select * from public.${table}`)),
    ).rejects.toThrow(/permission denied/);
  });

  it.each(["owned_project_ids", "owned_conversation_ids"])(
    "can't execute private.%s()",
    async (fn) => {
      await expect(
        s.as("anon", null, (tx) => tx.query(`select * from private.${fn}()`)),
      ).rejects.toThrow(/permission denied/);
    },
  );
});

describe("authenticated writes", () => {
  it.each(TABLES)("can't insert into %s", async (table) => {
    const { sql, params } = validInsert(table, a);
    await expect(s.as("authenticated", a.sub, (tx) => tx.query(sql, params))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each(["public_key = 'pk_test_changed_key'", "messages_used = 0", "owner_id = 'user_b'"])(
    "can't update projects set %s",
    async (assignment) => {
      await expect(
        s.as("authenticated", a.sub, (tx) =>
          tx.query(`update public.projects set ${assignment} where id = $1`, [a.projectId]),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it.each(TABLES.filter((t) => t !== "projects"))("can't update or delete %s", async (table) => {
    await expect(
      s.as("authenticated", a.sub, (tx) => tx.query(`delete from public.${table}`)),
    ).rejects.toThrow(/permission denied/);
    // Every table has created_at or a text column; a no-op self-assignment
    // still needs the UPDATE privilege on that column.
    const column =
      table === "widget_configs"
        ? "label"
        : table === "knowledge_chunks"
          ? "content"
          : "created_at";
    await expect(
      s.as("authenticated", a.sub, (tx) =>
        tx.query(`update public.${table} set ${column} = ${column}`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("can rename their own project", async () => {
    const { affectedRows } = await s.as("authenticated", a.sub, (tx) =>
      tx.query("update public.projects set name = 'Renamed' where id = $1", [a.projectId]),
    );
    expect(affectedRows).toBe(1);
    const { rows } = await s.db.query<{ name: string }>(
      "select name from public.projects where id = $1",
      [a.projectId],
    );
    expect(rows[0]?.name).toBe("Renamed");
  });

  it("can't rename another owner's project", async () => {
    const { affectedRows } = await s.as("authenticated", a.sub, (tx) =>
      tx.query("update public.projects set name = 'Hijacked' where id = $1", [b.projectId]),
    );
    expect(affectedRows).toBe(0);
    const { rows } = await s.db.query<{ name: string }>(
      "select name from public.projects where id = $1",
      [b.projectId],
    );
    expect(rows[0]?.name).toBe("Project 2");
  });

  it("can delete their own project, not another owner's", async () => {
    const other = await s.as("authenticated", a.sub, (tx) =>
      tx.query("delete from public.projects where id = $1", [b.projectId]),
    );
    expect(other.affectedRows).toBe(0);
    const own = await s.as("authenticated", a.sub, (tx) =>
      tx.query("delete from public.projects where id = $1", [a.projectId]),
    );
    expect(own.affectedRows).toBe(1);
    const { rows } = await s.db.query<{ id: string }>("select id from public.projects");
    expect(rows.map((r) => r.id)).toEqual([b.projectId]);
  });
});

describe("truncate", () => {
  it.each(TABLES.flatMap((t) => [["anon", t] as const, ["authenticated", t] as const]))(
    "%s can't truncate %s",
    async (role, table) => {
      await expect(
        s.as(role, a.sub, (tx) => tx.query(`truncate public.${table} cascade`)),
      ).rejects.toThrow(/permission denied/);
    },
  );
});

describe("service_role", () => {
  it("can insert, update and delete in every table", async () => {
    await s.as("service_role", null, async (tx) => {
      for (const table of TABLES) {
        if (table === "widget_configs") continue; // needs a project without a config
        const { sql, params } = validInsert(table, a);
        await tx.query(sql, params);
      }
      await tx.query(
        `insert into public.widget_configs
           (project_id, button_color, position, label, animation, header_text, show_badge)
         select id, '#ffffff', 'top-left', 'Help', 'slide', 'Ask us', false
         from public.projects where public_key = 'pk_test_new_project'`,
      );
      await tx.query(
        "update public.projects set messages_used = 5, public_key = 'pk_test_rotated' where id = $1",
        [a.projectId],
      );
      await tx.query("delete from public.messages where conversation_id = $1", [a.conversationId]);
    });
    const { rows } = await s.db.query<{ messages_used: number }>(
      "select messages_used from public.projects where id = $1",
      [a.projectId],
    );
    expect(rows[0]?.messages_used).toBe(5);
  });
});

describe("cascades", () => {
  async function count(table: string, column: string, id: string): Promise<number> {
    const { rows } = await s.db.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where ${column} = $1`,
      [id],
    );
    return rows[0]?.n ?? -1;
  }

  it("deleting a project deletes its config, sources, chunks, conversations and messages", async () => {
    await s.db.query("delete from public.projects where id = $1", [a.projectId]);
    expect(await count("widget_configs", "project_id", a.projectId)).toBe(0);
    expect(await count("knowledge_sources", "project_id", a.projectId)).toBe(0);
    expect(await count("knowledge_chunks", "project_id", a.projectId)).toBe(0);
    expect(await count("conversations", "project_id", a.projectId)).toBe(0);
    expect(await count("messages", "conversation_id", a.conversationId)).toBe(0);
    // Owner B is untouched.
    expect(await count("knowledge_chunks", "project_id", b.projectId)).toBe(1);
    expect(await count("messages", "conversation_id", b.conversationId)).toBe(1);
  });

  it("deleting a source deletes its chunks only", async () => {
    await s.db.query("delete from public.knowledge_sources where id = $1", [a.sourceId]);
    expect(await count("knowledge_chunks", "source_id", a.sourceId)).toBe(0);
    expect(await count("knowledge_chunks", "source_id", b.sourceId)).toBe(1);
    expect(await count("projects", "id", a.projectId)).toBe(1);
  });

  it("an owner deleting their project through RLS cascades too", async () => {
    await s.as("authenticated", a.sub, (tx) =>
      tx.query("delete from public.projects where id = $1", [a.projectId]),
    );
    expect(await count("knowledge_chunks", "project_id", a.projectId)).toBe(0);
    expect(await count("messages", "conversation_id", a.conversationId)).toBe(0);
  });
});

describe("pgvector", () => {
  it("stores a vector(1536) and finds the nearest chunk by cosine distance", async () => {
    const { rows } = await s.db.query<{ id: string }>(
      `select id from public.knowledge_chunks
       where project_id = $1
       order by embedding operator(extensions.<=>) $2::extensions.vector
       limit 1`,
      [a.projectId, vec(0.3)],
    );
    expect(rows[0]?.id).toBe(a.chunkId);
  });

  it("rejects a vector with the wrong dimension", async () => {
    await expect(
      s.db.query(
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'x', '[1,2,3]')",
        [a.projectId, a.sourceId],
      ),
    ).rejects.toThrow(/dimensions/);
  });

  it("has an HNSW cosine index on knowledge_chunks.embedding", async () => {
    const { rows } = await s.db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'knowledge_chunks_embedding_idx'",
    );
    expect(rows[0]?.indexdef).toMatch(/USING hnsw \(embedding extensions\.vector_cosine_ops\)/);
  });
});

describe("constraints match packages/shared", () => {
  it.each([
    ["plan", "update public.accounts set plan = 'enterprise'"],
    ["public_key", "update public.projects set public_key = 'not-a-key'"],
    ["project name length", `update public.projects set name = '${"x".repeat(81)}'`],
    ["blank project name", "update public.projects set name = '   '"],
    ["negative messages_used", "update public.projects set messages_used = -1"],
    ["button_color", "update public.widget_configs set button_color = 'red'"],
    ["position", "update public.widget_configs set position = 'middle'"],
    ["animation", "update public.widget_configs set animation = 'spin'"],
    ["label length", `update public.widget_configs set label = '${"x".repeat(31)}'`],
    ["header length", `update public.widget_configs set header_text = '${"x".repeat(81)}'`],
    ["source type", "update public.knowledge_sources set type = 'docx'"],
    ["source status", "update public.knowledge_sources set status = 'done'"],
    ["source title length", `update public.knowledge_sources set title = '${"x".repeat(201)}'`],
    ["visitor_id length", `update public.conversations set visitor_id = '${"x".repeat(65)}'`],
    ["message role", "update public.messages set role = 'system'"],
  ])("rejects a bad %s", async (_name, sql) => {
    await expect(s.db.query(sql)).rejects.toThrow(/violates check constraint/);
  });

  it("rejects a duplicate public_key", async () => {
    await expect(
      s.db.query("update public.projects set public_key = 'pk_test_owner_1' where id = $1", [
        b.projectId,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects a chunk whose project differs from its source's project", async () => {
    await expect(
      s.db.query(
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'x', $3)",
        [b.projectId, a.sourceId, vec(0.1)],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("applies the documented defaults", async () => {
    const { rows } = await s.db.query<{ plan: string; messages_used: number; fresh: boolean }>(
      `select a.plan, p.messages_used, p.period_start > now() - interval '1 minute' as fresh
       from public.accounts a join public.projects p on p.owner_id = a.clerk_user_id
       where p.id = $1`,
      [a.projectId],
    );
    expect(rows[0]).toEqual({ plan: "free", messages_used: 0, fresh: true });
  });
});
