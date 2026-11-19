import type { Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
// Relative import: @kivo/db doesn't depend on @kivo/shared, and the test only
// needs the constant to compare against.
import { DEFAULT_WIDGET_CONFIG } from "../../shared/src/widget";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";

// public.create_project (supabase/migrations/*_create_project.sql): creates a
// project and its default widget config under the plan's project limit.
// Called as service_role, like the server does.

const OWNER = "user_owner";
const FREE_LIMIT = 1;
const PRO_LIMIT = 5;

let s: SupabasePglite;

// One database for the file, emptied before each test: a pglite instance per
// test runs a 4 GB machine out of memory next to the other test files.
beforeAll(async () => {
  s = await createSupabasePglite();
});

beforeEach(async () => {
  await s.db.exec("truncate public.accounts cascade");
  await s.db.query("insert into public.accounts (clerk_user_id) values ($1)", [OWNER]);
});

afterAll(async () => {
  await s.close();
});

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  messages_used: number;
}

const CALL = "select * from public.create_project($1, $2, $3, $4)";

function createProject(
  owner: string,
  n: number,
  limit: number,
  tx?: Transaction,
): Promise<ProjectRow> {
  const run = async (t: Transaction) => {
    const { rows } = await t.query<ProjectRow>(CALL, [
      owner,
      `Project ${n}`,
      `pk_test_key_${n}`,
      limit,
    ]);
    const row = rows[0];
    if (!row) throw new Error("create_project returned no row");
    return row;
  };
  return tx ? run(tx) : s.as("service_role", null, run);
}

async function count(table: "projects" | "widget_configs"): Promise<number> {
  const { rows } = await s.db.query<{ n: number }>(
    `select count(*)::int as n from public.${table}`,
  );
  return rows[0]?.n ?? -1;
}

/** Postgres error with its SQLSTATE (pglite exposes it as `code`). */
async function sqlError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (err) {
    return err as { code?: string; message: string };
  }
  throw new Error("expected the call to fail");
}

describe("create_project", () => {
  it("returns the new project row for the owner", async () => {
    const row = await createProject(OWNER, 1, FREE_LIMIT);
    expect(row).toMatchObject({
      owner_id: OWNER,
      name: "Project 1",
      public_key: "pk_test_key_1",
      messages_used: 0,
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("Free limit 1: the first call works, the second raises the limit error and inserts nothing", async () => {
    await createProject(OWNER, 1, FREE_LIMIT);

    const err = await sqlError(createProject(OWNER, 2, FREE_LIMIT));
    expect(err.code).toBe("KV002");
    expect(err.message).toMatch(/^project_limit: /);
    expect(await count("projects")).toBe(1);
    expect(await count("widget_configs")).toBe(1);
  });

  it("limit 5 allows 5 projects and refuses the 6th", async () => {
    for (let n = 1; n <= PRO_LIMIT; n++) await createProject(OWNER, n, PRO_LIMIT);
    expect(await count("projects")).toBe(PRO_LIMIT);

    const err = await sqlError(createProject(OWNER, 6, PRO_LIMIT));
    expect(err.code).toBe("KV002");
    expect(await count("projects")).toBe(PRO_LIMIT);
    expect(await count("widget_configs")).toBe(PRO_LIMIT);
  });

  it("counts only the owner's own projects", async () => {
    await s.db.query("insert into public.accounts (clerk_user_id) values ('user_other')");
    await createProject("user_other", 1, FREE_LIMIT);
    await expect(createProject(OWNER, 2, FREE_LIMIT)).resolves.toMatchObject({ owner_id: OWNER });
  });

  it("creates a widget_configs row equal to DEFAULT_WIDGET_CONFIG", async () => {
    const { id } = await createProject(OWNER, 1, FREE_LIMIT);
    const { rows } = await s.db.query(
      `select button_color, position, label, animation, header_text, show_badge
       from public.widget_configs where project_id = $1`,
      [id],
    );
    expect(rows).toEqual([DEFAULT_WIDGET_CONFIG]);
  });

  it("missing account: raises account_not_found and inserts nothing", async () => {
    const err = await sqlError(createProject("user_nobody", 1, FREE_LIMIT));
    expect(err.code).toBe("KV001");
    expect(err.message).toMatch(/^account_not_found: /);
    expect(await count("projects")).toBe(0);
  });

  it.each([null, -1])("rejects p_max_projects = %s", async (limit) => {
    const err = await sqlError(
      s.as("service_role", null, (tx) => tx.query(CALL, [OWNER, "P", "pk_test_key_1", limit])),
    );
    expect(err.code).toBe("22023");
    expect(await count("projects")).toBe(0);
  });

  it("duplicate public_key: unique violation, nothing inserted", async () => {
    await createProject(OWNER, 1, PRO_LIMIT);
    const err = await sqlError(
      s.as("service_role", null, (tx) =>
        tx.query(CALL, [OWNER, "Other", "pk_test_key_1", PRO_LIMIT]),
      ),
    );
    expect(err.code).toBe("23505");
    expect(await count("projects")).toBe(1);
    expect(await count("widget_configs")).toBe(1);
  });

  it("an invalid name hits the table's check constraint, nothing inserted", async () => {
    const err = await sqlError(
      s.as("service_role", null, (tx) =>
        tx.query(CALL, [OWNER, "   ", "pk_test_key_1", PRO_LIMIT]),
      ),
    );
    expect(err.code).toBe("23514");
    expect(await count("projects")).toBe(0);
  });

  it.each(["anon", "authenticated"] as const)("%s can't execute it", async (role) => {
    const err = await sqlError(
      s.as(role, OWNER, (tx) => tx.query(CALL, [OWNER, "P", "pk_test_key_1", PRO_LIMIT])),
    );
    expect(err.message).toMatch(/permission denied for function create_project/);
    expect(await count("projects")).toBe(0);
  });

  it("is SECURITY INVOKER with an empty search_path, executable by service_role only", async () => {
    const { rows } = await s.db.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
      public: boolean;
    }>(
      `select p.prosecdef, p.proconfig,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
         has_function_privilege('service_role', p.oid, 'execute') as service_role,
         exists (
           select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ) as public
       from pg_proc p
       where p.oid = 'public.create_project(text, text, text, integer)'::regprocedure`,
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
