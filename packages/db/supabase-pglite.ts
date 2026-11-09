// An in-memory Postgres that behaves like the Supabase database for tests:
// pglite + pgvector, Supabase's API roles and default privileges, a stub of
// `auth.jwt()`, and every migration in supabase/migrations applied in order.
// Never use a local Supabase stack or a Docker database (CLAUDE.md).

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/** The roles a Supabase request runs as. `postgres` is the migration owner. */
export type SupabaseRole = "anon" | "authenticated" | "service_role";

/**
 * What a Supabase project has before the first migration: the API roles,
 * the `auth` and `extensions` schemas, `auth.jwt()` (same body as Supabase's),
 * and Supabase's default privileges in `public`, which grant ALL on new
 * tables and EXECUTE on new functions to anon and authenticated. Migrations
 * must revoke what they don't want, so the stub keeps those defaults.
 */
const SUPABASE_BOOTSTRAP = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  create schema auth;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;

  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
`;

/** Migration files in apply order (their names start with a UTC timestamp). */
export async function listMigrations(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith(".sql")).sort();
}

export interface SupabasePglite {
  /** The database, as the `postgres` superuser (the migration owner). */
  db: PGlite;
  /**
   * Run `fn` in a transaction as `role`, with JWT claims `{ sub, role }`
   * (`sub` omitted when null), the way PostgREST runs a request.
   * Commits if `fn` resolves, rolls back if it throws.
   */
  as<T>(role: SupabaseRole, sub: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Start a fresh in-memory database with every migration applied. */
export async function createSupabasePglite(
  options: { migrationsDir?: string } = {},
): Promise<SupabasePglite> {
  const dir = options.migrationsDir ?? MIGRATIONS_DIR;
  const db = await PGlite.create({ extensions: { vector } });

  await db.exec(SUPABASE_BOOTSTRAP);
  for (const file of await listMigrations(dir)) {
    const sql = await readFile(`${dir}/${file}`, "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }

  return {
    db,
    as(role, sub, fn) {
      const claims = JSON.stringify(sub === null ? { role } : { sub, role });
      return db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
        // Role names are a closed union, so interpolating is safe.
        await tx.exec(`set local role ${role}`);
        return fn(tx);
      });
    },
    close: () => db.close(),
  };
}
