import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
// Relative import: @kivo/db doesn't depend on @kivo/shared, and the test only
// needs the constants to compare against.
import { ALLOWED_FILE_TYPES, MAX_KNOWLEDGE_FILE_BYTES } from "../../shared/src/limits";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { seedOwner, type OwnerRows } from "./fixtures";

// supabase/migrations/*_knowledge.sql: reserve_knowledge_source and the
// `knowledge` bucket. Called as service_role, like the server does.

const CALL = "select * from public.reserve_knowledge_source($1, $2, $3, $4, $5)";
const LIMIT = 3;

interface Reserved {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
  created_at: Date;
  reclaimed_storage_keys: string[];
}

let s: SupabasePglite;
let a: OwnerRows;
let b: OwnerRows;

// One database for the file, emptied before each test (see create-project.test.ts).
// seedOwner gives each project one `ready` text source.
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

async function sqlError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    return err as { code?: string; message: string };
  }
  throw new Error("expected the call to fail");
}

function reserve(projectId: string, title: string, type: string, status: string, max = LIMIT): Promise<Reserved> {
  return s.as("service_role", null, async (tx) => {
    const { rows } = await tx.query<Reserved>(CALL, [projectId, title, type, status, max]);
    if (rows.length !== 1 || !rows[0]) throw new Error(`expected one row, got ${rows.length}`);
    return rows[0];
  });
}

const reserveFile = (projectId: string, title = "Doc", type = "pdf") => reserve(projectId, title, type, "uploading");

async function countSources(projectId: string): Promise<number> {
  const { rows } = await s.db.query<{ n: number }>(
    "select count(*)::int as n from public.knowledge_sources where project_id = $1",
    [projectId],
  );
  return rows[0]?.n ?? -1;
}

/** Backdate a source's created_at by `hours`. */
async function age(sourceId: string, hours: number): Promise<void> {
  await s.db.query("update public.knowledge_sources set created_at = now() - $2::numeric * interval '1 hour' where id = $1", [
    sourceId,
    hours,
  ]);
}

describe("reserve_knowledge_source", () => {
  it("reserves pasted text as processing with no storage key", async () => {
    const r = await reserve(a.projectId, "Pricing", "text", "processing");
    expect(r).toMatchObject({
      project_id: a.projectId,
      title: "Pricing",
      type: "text",
      status: "processing",
      storage_key: null,
      reclaimed_storage_keys: [],
    });
    expect(await countSources(a.projectId)).toBe(2);
  });

  it.each(["pdf", "md", "txt"])("gives a %s file the storage key <project_id>/<source_id>.<type>", async (type) => {
    const r = await reserveFile(a.projectId, "Manual", type);
    expect(r.status).toBe("uploading");
    expect(r.storage_key).toBe(`${a.projectId}/${r.id}.${type}`);
    const { rows } = await s.db.query<{ storage_key: string }>(
      "select storage_key from public.knowledge_sources where id = $1",
      [r.id],
    );
    expect(rows[0]?.storage_key).toBe(r.storage_key);
  });

  it("limit 3 refuses the 4th source (any status counts) with KV005", async () => {
    await reserve(a.projectId, "Two", "text", "processing"); // seed's ready source is #1
    await reserveFile(a.projectId, "Three");
    expect(await countSources(a.projectId)).toBe(3);

    const err = await sqlError(reserveFile(a.projectId, "Four"));
    expect(err.code).toBe("KV005");
    expect(err.message).toMatch(/^knowledge_limit: /);
    expect(await countSources(a.projectId)).toBe(3);
  });

  it("counts failed sources too", async () => {
    await s.db.query(
      `insert into public.knowledge_sources (project_id, title, type, status)
       values ($1, 'F1', 'text', 'failed'), ($1, 'F2', 'text', 'failed')`,
      [a.projectId],
    );
    expect((await sqlError(reserve(a.projectId, "X", "text", "processing"))).code).toBe("KV005");
  });

  it("only counts this project's sources", async () => {
    await reserve(b.projectId, "B2", "text", "processing");
    await reserve(b.projectId, "B3", "text", "processing");
    await expect(reserve(a.projectId, "A2", "text", "processing")).resolves.toMatchObject({ title: "A2" });
  });

  it("reclaims uploading rows older than 2 h, returns their keys and frees the slots", async () => {
    const old1 = await reserveFile(a.projectId, "Old 1");
    const old2 = await reserveFile(a.projectId, "Old 2", "md");
    await age(old1.id, 3);
    await age(old2.id, 2.1);
    // Full: seed + 2 uploading.
    const r = await reserveFile(a.projectId, "New");
    expect([...r.reclaimed_storage_keys].sort()).toEqual([old1.storage_key, old2.storage_key].sort());
    const { rows } = await s.db.query<{ id: string }>(
      "select id from public.knowledge_sources where project_id = $1 order by created_at",
      [a.projectId],
    );
    expect(rows.map((x) => x.id)).toEqual([a.sourceId, r.id]);
  });

  it("keeps fresh uploading rows: they still count", async () => {
    const fresh = await reserveFile(a.projectId, "Fresh");
    await age(fresh.id, 1.9);
    await reserveFile(a.projectId, "Fresh 2");
    expect((await sqlError(reserveFile(a.projectId, "Four"))).code).toBe("KV005");
    expect(await countSources(a.projectId)).toBe(3);
  });

  it("doesn't reclaim old sources in other statuses or other projects", async () => {
    const old = await reserve(a.projectId, "Old text", "text", "processing");
    await age(old.id, 10);
    await age(a.sourceId, 10);
    const bOld = await reserveFile(b.projectId, "B old");
    await age(bOld.id, 10);

    const r = await reserveFile(a.projectId, "New");
    expect(r.reclaimed_storage_keys).toEqual([]);
    expect(await countSources(a.projectId)).toBe(3);
    expect(await countSources(b.projectId)).toBe(2);
  });

  it("rolls back the reclaim when the limit still refuses", async () => {
    const old = await reserveFile(a.projectId, "Old");
    await age(old.id, 3);
    // Limit 1: after reclaiming, the seed's source alone fills it.
    const refused = await sqlError(reserve(a.projectId, "New", "pdf", "uploading", 1));
    expect(refused.code).toBe("KV005");
    // The old reservation is still there: the next call can reclaim it and return its key.
    expect(await countSources(a.projectId)).toBe(2);
    expect((await reserveFile(a.projectId, "Later")).reclaimed_storage_keys).toEqual([old.storage_key]);
  });

  it("raises KV004 for an unknown project", async () => {
    const err = await sqlError(reserveFile("00000000-0000-4000-8000-000000000000"));
    expect(err.code).toBe("KV004");
    expect(err.message).toMatch(/^project_not_found: /);
  });

  it.each([
    ["text", "uploading"],
    ["pdf", "processing"],
    ["pdf", "ready"],
    ["docx", "uploading"],
  ])("refuses type %s with status %s (22023)", async (type, status) => {
    expect((await sqlError(reserve(a.projectId, "X", type, status))).code).toBe("22023");
    expect(await countSources(a.projectId)).toBe(1);
  });

  it.each([null, -1])("refuses p_max_sources %s (22023)", async (max) => {
    const err = await sqlError(
      s.as("service_role", null, (tx) => tx.query(CALL, [a.projectId, "X", "text", "processing", max])),
    );
    expect(err.code).toBe("22023");
  });

  it("refuses a blank title (23514)", async () => {
    expect((await sqlError(reserve(a.projectId, "  ", "text", "processing"))).code).toBe("23514");
  });

  it.each(["anon", "authenticated"] as const)("%s can't execute it", async (role) => {
    const err = await sqlError(
      s.as(role, "user_a", (tx) => tx.query(CALL, [a.projectId, "X", "text", "processing", LIMIT])),
    );
    expect(err.message).toMatch(/permission denied for function reserve_knowledge_source/);
    expect(await countSources(a.projectId)).toBe(1);
  });

  it("is SECURITY INVOKER with an empty search_path, executable by service_role only", async () => {
    const { rows } = await s.db.query(
      `select p.prosecdef, p.proconfig,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
         has_function_privilege('service_role', p.oid, 'execute') as service_role,
         exists (
           select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ) as public
       from pg_proc p
       where p.oid = 'public.reserve_knowledge_source(uuid, text, text, text, integer)'::regprocedure`,
    );
    expect(rows).toEqual([
      {
        prosecdef: false,
        proconfig: ['search_path=""'],
        anon: false,
        authenticated: false,
        service_role: true,
        public: false,
      },
    ]);
  });
});

describe("knowledge bucket", () => {
  it("is private with the shared size and type limits", async () => {
    const { rows } = await s.db.query(
      "select id, name, public, file_size_limit::text as size, allowed_mime_types from storage.buckets",
    );
    expect(rows).toEqual([
      {
        id: "knowledge",
        name: "knowledge",
        public: false,
        size: String(MAX_KNOWLEDGE_FILE_BYTES),
        allowed_mime_types: Object.values(ALLOWED_FILE_TYPES),
      },
    ]);
  });
});
