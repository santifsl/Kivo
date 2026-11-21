import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigration,
  bootstrapDump,
  createSupabasePglite,
  listMigrations,
  MIGRATION_ROLE,
  MIGRATIONS_DIR,
  type PgliteDump,
  type SupabasePglite,
} from "../supabase-pglite";

// Migrations run as a non-superuser in a fresh session each, as on Supabase
// (P3K-T12). #21's chat migration passed here as superuser but failed on dev
// with 42501, because a function can only SET hnsw.iterative_scan once
// pgvector's library is loaded in the session (fixed in P3K-T11 by a vector
// cast before match_chunks). These tests prove the helper now catches that.

const CHAT = "20261119020544_chat_functions.sql";
const LOAD_PGVECTOR = "select '[1]'::extensions.vector;";

describe("migrations as the migration role", () => {
  let s: SupabasePglite;

  beforeAll(async () => {
    s = await createSupabasePglite();
  });

  afterAll(async () => {
    await s.close();
  });

  it("the migration role is not a superuser", async () => {
    const { rows } = await s.db.query<{ rolsuper: boolean }>(
      "select rolsuper from pg_roles where rolname = $1",
      [MIGRATION_ROLE],
    );
    expect(rows).toEqual([{ rolsuper: false }]);
  });

  it("owns every table and function the migrations created in public", async () => {
    const { rows } = await s.db.query<{ kind: string; name: string; owner: string }>(
      `select 'table' as kind, tablename as name, tableowner as owner
         from pg_tables where schemaname = 'public'
       union all
       select 'function', p.proname, pg_get_userbyid(p.proowner)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
       order by 1, 2`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.owner !== MIGRATION_ROLE)).toEqual([]);
  });
});

describe(`${CHAT} in a fresh session`, () => {
  let before: PgliteDump;
  let chatSql: string;

  beforeAll(async () => {
    const files = await listMigrations();
    expect(files).toContain(CHAT);
    before = await bootstrapDump();
    for (const file of files.filter((f) => f < CHAT)) {
      before = await applyMigration(
        before,
        file,
        await readFile(join(MIGRATIONS_DIR, file), "utf8"),
      );
    }
    chatSql = await readFile(join(MIGRATIONS_DIR, CHAT), "utf8");
  });

  it("fails with 42501 without the pgvector load line", async () => {
    const withoutLoad = chatSql.replace(LOAD_PGVECTOR, "");
    expect(withoutLoad).not.toBe(chatSql); // the line was there to remove

    const error = await applyMigration(before, CHAT, withoutLoad).then(
      () => null,
      (e: unknown) => e as Error & { cause?: { code?: string } },
    );
    expect(error?.cause?.code).toBe("42501");
    expect(error?.message).toMatch(/permission denied to set parameter "hnsw\.iterative_scan"/);
  });

  it("applies as merged, with the line", async () => {
    await expect(applyMigration(before, CHAT, chatSql)).resolves.toBeDefined();
  });
});
