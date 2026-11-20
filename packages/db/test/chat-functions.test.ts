import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { seedOwner, vec, type OwnerRows } from "./fixtures";

// The chat route's functions (supabase/migrations/*_chat_functions.sql):
// consume_message, save_chat_turn, match_chunks. Called as service_role, like
// the server does.

let s: SupabasePglite;
let a: OwnerRows;
let b: OwnerRows;

// One database for the file, emptied before each test (see create-project.test.ts).
beforeAll(async () => {
  s = await createSupabasePglite();
});

beforeEach(async () => {
  await s.db.exec("truncate public.accounts cascade");
  a = await seedOwner(s.db, "user_a", 1);
  b = await seedOwner(s.db, "user_b", 2);
});

afterAll(async () => {
  await s.close();
});

/** Postgres error with its SQLSTATE (pglite exposes it as `code`). */
async function sqlError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    return err as { code?: string; message: string };
  }
  throw new Error("expected the call to fail");
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return s.as("service_role", null, async (tx) => {
    const { rows } = await tx.query<T>(sql, params);
    const row = rows[0];
    if (!row) throw new Error(`no row: ${sql}`);
    return row;
  });
}

/** rows[i], failing the test if it's missing. */
function at<T>(rows: T[], i: number): T {
  const row = rows[i];
  if (row === undefined) throw new Error(`no row ${i}`);
  return row;
}

async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await s.db.query<{ v: T }>(sql, params);
  return at(rows, 0).v;
}

// ---------------------------------------------------------------------------

describe("consume_message", () => {
  const consume = async (projectId: string, limit: number | null) =>
    (await one<{ ok: boolean }>("select public.consume_message($1, $2) as ok", [projectId, limit]))
      .ok;

  const used = (projectId: string) =>
    scalar<number>("select messages_used as v from public.projects where id = $1", [projectId]);

  it("counts up to the limit, then returns false without counting", async () => {
    for (let i = 1; i <= 3; i++) {
      expect(await consume(a.projectId, 3)).toBe(true);
      expect(await used(a.projectId)).toBe(i);
    }
    expect(await consume(a.projectId, 3)).toBe(false);
    expect(await consume(a.projectId, 3)).toBe(false);
    expect(await used(a.projectId)).toBe(3);
    // Other projects are untouched.
    expect(await used(b.projectId)).toBe(0);
  });

  it("resets on a new month: count = 1, period_start = start of the current UTC month", async () => {
    await s.db.query(
      `update public.projects
       set messages_used = 100, period_start = date_trunc('month', now(), 'UTC') - interval '1 day'
       where id = $1`,
      [a.projectId],
    );
    expect(await consume(a.projectId, 100)).toBe(true);
    const row = await one<{ messages_used: number; at_month_start: boolean }>(
      `select messages_used,
         period_start = date_trunc('month', now(), 'UTC') as at_month_start
       from public.projects where id = $1`,
      [a.projectId],
    );
    expect(row).toEqual({ messages_used: 1, at_month_start: true });
  });

  it("doesn't reset within the current month", async () => {
    await s.db.query(
      `update public.projects
       set messages_used = 5, period_start = date_trunc('month', now(), 'UTC')
       where id = $1`,
      [a.projectId],
    );
    expect(await consume(a.projectId, 5)).toBe(false);
    expect(await used(a.projectId)).toBe(5);
  });

  it.each([0, -1, null])("limit %s → false, nothing counted (even on rollover)", async (limit) => {
    await s.db.query(
      "update public.projects set period_start = now() - interval '2 months' where id = $1",
      [a.projectId],
    );
    expect(await consume(a.projectId, limit)).toBe(false);
    expect(await used(a.projectId)).toBe(0);
  });

  it("unknown project → false", async () => {
    expect(await consume("00000000-0000-0000-0000-000000000000", 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("save_chat_turn", () => {
  const CALL = "select public.save_chat_turn($1, $2, $3, $4, $5) as id";

  const save = async (projectId: string, conversationId: string | null, q: string, r: string) =>
    (await one<{ id: string }>(CALL, [projectId, conversationId, "visitor-9", q, r])).id;

  const messages = async (conversationId: string) =>
    (
      await s.db.query<{ role: string; body: string }>(
        "select role, body from public.messages where conversation_id = $1 order by created_at",
        [conversationId],
      )
    ).rows;

  const count = (table: "conversations" | "messages") =>
    scalar<number>(`select count(*)::int as v from public.${table}`);

  it("creates a conversation in the project when none is given", async () => {
    const id = await save(a.projectId, null, "Hi?", "Hello!");
    const conv = await one<{ project_id: string; visitor_id: string }>(
      "select project_id, visitor_id from public.conversations where id = $1",
      [id],
    );
    expect(conv).toEqual({ project_id: a.projectId, visitor_id: "visitor-9" });
    expect(await messages(id)).toEqual([
      { role: "visitor", body: "Hi?" },
      { role: "bot", body: "Hello!" },
    ]);
  });

  it("appends to an existing conversation, reply strictly after the question", async () => {
    const id = await save(a.projectId, a.conversationId, "Q1", "A1");
    expect(id).toBe(a.conversationId);
    await save(a.projectId, a.conversationId, "Q2", "A2");

    expect(await messages(id)).toEqual([
      { role: "visitor", body: "Hi" }, // from the seed
      { role: "visitor", body: "Q1" },
      { role: "bot", body: "A1" },
      { role: "visitor", body: "Q2" },
      { role: "bot", body: "A2" },
    ]);
    // The reply sorts strictly after its question (microseconds; JS dates drop them).
    expect(
      await scalar<boolean>(
        `select (select created_at from public.messages where body = 'A1')
              > (select created_at from public.messages where body = 'Q1') as v`,
      ),
    ).toBe(true);
  });

  it("another project's conversation id → conversation_not_found, nothing inserted", async () => {
    const before = {
      conversations: await count("conversations"),
      messages: await count("messages"),
    };
    const err = await sqlError(save(a.projectId, b.conversationId, "Q", "A"));
    expect(err.code).toBe("KV003");
    expect(err.message).toMatch(/^conversation_not_found: /);
    expect({
      conversations: await count("conversations"),
      messages: await count("messages"),
    }).toEqual(before);
  });

  it("an empty reply fails the check constraint and rolls back the new conversation", async () => {
    const before = await count("conversations");
    const err = await sqlError(save(a.projectId, null, "Q", ""));
    expect(err.code).toBe("23514");
    expect(await count("conversations")).toBe(before);
  });
});

// ---------------------------------------------------------------------------

describe("match_chunks", () => {
  /** A unit-ish vector pointing mostly along axis `i` (cosine-distinct per axis). */
  function axis(i: number, mix = 0): string {
    const v = Array.from({ length: 1536 }, () => 0);
    v[i] = 1;
    v[1535] = mix;
    return `[${v.join(",")}]`;
  }

  async function addSource(projectId: string, status: string): Promise<string> {
    const { rows } = await s.db.query<{ id: string }>(
      `insert into public.knowledge_sources (project_id, title, type, status)
       values ($1, 'Doc', 'text', $2) returning id`,
      [projectId, status],
    );
    return at(rows, 0).id;
  }

  async function addChunk(projectId: string, sourceId: string, content: string, embedding: string) {
    await s.db.query(
      `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
       values ($1, $2, $3, $4)`,
      [projectId, sourceId, content, embedding],
    );
  }

  const match = async (projectId: string, embedding: string, count?: number | null) =>
    s.as("service_role", null, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        source_id: string;
        content: string;
        similarity: number;
      }>(
        count === undefined
          ? "select * from public.match_chunks($1, $2)"
          : "select * from public.match_chunks($1, $2, $3)",
        count === undefined ? [projectId, embedding] : [projectId, embedding, count],
      );
      return rows;
    });

  beforeEach(async () => {
    // Drop the seed chunks so each test controls exactly what exists.
    await s.db.exec("delete from public.knowledge_chunks");
  });

  it("returns only this project's chunks from ready sources, best first", async () => {
    const ready = await addSource(a.projectId, "ready");
    const processing = await addSource(a.projectId, "processing");
    const failed = await addSource(a.projectId, "failed");
    const otherReady = await addSource(b.projectId, "ready");

    await addChunk(a.projectId, ready, "far", axis(0, 3));
    await addChunk(a.projectId, ready, "exact", axis(0));
    await addChunk(a.projectId, ready, "near", axis(0, 0.5));
    await addChunk(a.projectId, processing, "not ready", axis(0));
    await addChunk(a.projectId, failed, "failed", axis(0));
    await addChunk(b.projectId, otherReady, "other project", axis(0));

    const rows = await match(a.projectId, axis(0));
    expect(rows.map((r) => r.content)).toEqual(["exact", "near", "far"]);
    expect(rows.every((r) => r.source_id === ready)).toBe(true);
    const [best, mid, worst] = [at(rows, 0), at(rows, 1), at(rows, 2)];
    expect(best.similarity).toBeCloseTo(1, 5);
    expect(best.similarity).toBeGreaterThan(mid.similarity);
    expect(mid.similarity).toBeGreaterThan(worst.similarity);
  });

  it("returns at most p_count rows (default 5)", async () => {
    const ready = await addSource(a.projectId, "ready");
    for (let i = 0; i < 8; i++) await addChunk(a.projectId, ready, `c${i}`, axis(0, i / 10));

    expect(await match(a.projectId, axis(0))).toHaveLength(5);
    const two = await match(a.projectId, axis(0), 2);
    expect(two.map((r) => r.content)).toEqual(["c0", "c1"]);
  });

  it("returns nothing for a project with no ready chunks", async () => {
    expect(await match(b.projectId, axis(0))).toEqual([]);
  });

  it.each([0, 51, null])("rejects p_count = %s", async (count) => {
    const err = await sqlError(match(a.projectId, axis(0), count));
    expect(err.code).toBe("22023");
  });

  it("runs with hnsw.iterative_scan = strict_order so the project filter can't starve results", async () => {
    const config = await scalar<string[]>(
      `select proconfig as v from pg_proc
       where oid = 'public.match_chunks(uuid, extensions.vector, integer)'::regprocedure`,
    );
    expect(config).toContain("hnsw.iterative_scan=strict_order");
  });

  it("HNSW path: a small project's chunks are found next to many closer chunks of another project", async () => {
    const mine = await addSource(a.projectId, "ready");
    const theirs = await addSource(b.projectId, "ready");
    // 300 chunks of project B right on the query; project A's 3 are further away.
    await s.db.query(
      `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
       select $1, $2, 'b' || g, $3::extensions.vector from generate_series(1, 300) g`,
      [b.projectId, theirs, vec(0.5)],
    );
    for (let i = 0; i < 3; i++) await addChunk(a.projectId, mine, `a${i}`, axis(i));

    // On a table this small the planner prefers the project_id btree (exact
    // results). Take that away so the query must walk the HNSW index, with a
    // small candidate list. Rolled back at the end.
    await s.db.transaction(async (tx) => {
      await tx.exec(`
        drop index public.knowledge_chunks_project_id_idx;
        drop index public.knowledge_chunks_source_id_project_id_idx;
        set local enable_seqscan = off;
        set local hnsw.ef_search = 10;
      `);
      const query = `
        select c.content
        from public.knowledge_chunks c
        join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
        where c.project_id = $1 and s.status = 'ready'
        order by c.embedding operator(extensions.<=>) $2::extensions.vector
        limit 5`;
      const plan = await tx.query<{ "QUERY PLAN": string }>(`explain ${query}`, [
        a.projectId,
        vec(0.5),
      ]);
      expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toMatch(
        /Index Scan using knowledge_chunks_embedding_idx/,
      );

      // Without iterative scan, the 10 candidates are all project B's: starved.
      await tx.exec("set local hnsw.iterative_scan = off");
      const starved = await tx.query(query, [a.projectId, vec(0.5)]);
      expect(starved.rows.length).toBeLessThan(3);

      // match_chunks sets strict_order itself and finds all three.
      await tx.exec("set local role service_role");
      const { rows } = await tx.query<{ content: string }>(
        "select content from public.match_chunks($1, $2)",
        [a.projectId, vec(0.5)],
      );
      expect(rows.map((r) => r.content).sort()).toEqual(["a0", "a1", "a2"]);
      await tx.rollback();
    });
  });
});

// ---------------------------------------------------------------------------

describe("privileges", () => {
  const FUNCTIONS = [
    {
      name: "consume_message",
      sig: "public.consume_message(uuid, integer)",
      call: (r: OwnerRows) => ["select public.consume_message($1, 10)", [r.projectId]] as const,
    },
    {
      name: "save_chat_turn",
      sig: "public.save_chat_turn(uuid, uuid, text, text, text)",
      call: (r: OwnerRows) =>
        ["select public.save_chat_turn($1, null, 'v', 'q', 'a')", [r.projectId]] as const,
    },
    {
      name: "match_chunks",
      sig: "public.match_chunks(uuid, extensions.vector, integer)",
      call: (r: OwnerRows) =>
        ["select * from public.match_chunks($1, $2)", [r.projectId, vec(0.1)]] as const,
    },
  ];

  describe.each(FUNCTIONS)("$name", ({ name, sig, call }) => {
    it.each(["anon", "authenticated"] as const)("%s can't execute it", async (role) => {
      const [sql, params] = call(a);
      const err = await sqlError(s.as(role, a.sub, (tx) => tx.query(sql, [...params])));
      expect(err.message).toMatch(new RegExp(`permission denied for function ${name}`));
    });

    it("service_role can execute it", async () => {
      const [sql, params] = call(a);
      await expect(
        s.as("service_role", null, (tx) => tx.query(sql, [...params])),
      ).resolves.toBeDefined();
    });

    it("is SECURITY INVOKER with an empty search_path, executable by service_role only", async () => {
      const { rows } = await s.db.query<{
        prosecdef: boolean;
        search_path: boolean;
        anon: boolean;
        authenticated: boolean;
        service_role: boolean;
        public: boolean;
      }>(
        `select p.prosecdef,
           'search_path=""' = any (p.proconfig) as search_path,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
           has_function_privilege('service_role', p.oid, 'execute') as service_role,
           exists (
             select 1 from aclexplode(p.proacl) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as public
         from pg_proc p
         where p.oid = $1::regprocedure`,
        [sig],
      );
      expect(rows).toEqual([
        {
          prosecdef: false,
          search_path: true,
          anon: false,
          authenticated: false,
          service_role: true,
          public: false,
        },
      ]);
    });
  });
});
