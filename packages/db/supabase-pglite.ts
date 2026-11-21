// An in-memory Postgres that behaves like the Supabase database for tests:
// pglite + pgvector, Supabase's API roles and default privileges, a stub of
// `auth.jwt()`, and every migration in supabase/migrations applied in order.
// Never use a local Supabase stack or a Docker database (CLAUDE.md).
//
// Migrations run the way they run on Supabase: as a NON-superuser migration
// role (MIGRATION_ROLE, standing in for Supabase's `postgres`), each in a
// fresh session. pglite's own user is a superuser and pglite is one session,
// so each migration gets its own pglite instance, restored from a dump of the
// previous one. A fresh session matters: e.g. a function can only
// `SET hnsw.iterative_scan` once pgvector's library is loaded in that session
// (P3K-T11), which an earlier migration in the same session would hide.
//
// Usage (see packages/db/test for more):
//   const s = await createSupabasePglite();
//   await s.as("authenticated", "user_a", (tx) => tx.query("select * from public.projects"));
//   await s.close();

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/**
 * The migrated-database cache: inside this package's node_modules (gitignored,
 * owned by whoever checked out the repo), not a shared temp dir another user
 * could plant files or symlinks in.
 */
const CACHE_DIR = fileURLToPath(new URL("./node_modules/.cache/kivo-pglite/", import.meta.url));

/** The roles a Supabase request runs as. */
export type SupabaseRole = "anon" | "authenticated" | "service_role";

/**
 * Applies the migrations, like Supabase's `postgres` role: not a superuser,
 * but CREATEROLE, CREATEDB and BYPASSRLS, owner of `public`, with CREATE on
 * the database (schemas) and on `extensions`, and write access to
 * `storage.buckets`.
 */
export const MIGRATION_ROLE = "migration_owner";

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
  create role ${MIGRATION_ROLE} nologin nosuperuser createrole createdb bypassrls;

  create schema extensions;
  create schema auth;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;

  -- Storage: just the buckets table, with the columns migrations set
  -- (Supabase's has more). API roles get no grants here, as in Supabase,
  -- where storage is reached through the Storage API.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;

  -- The migration role's rights (see MIGRATION_ROLE).
  alter schema public owner to ${MIGRATION_ROLE};
  grant usage, create on schema extensions to ${MIGRATION_ROLE};
  grant usage on schema auth, storage to ${MIGRATION_ROLE};
  grant select, insert, update, delete on storage.buckets to ${MIGRATION_ROLE};
  do $$ begin
    execute format('grant create on database %I to ${MIGRATION_ROLE}', current_database());
  end $$;

  -- Supabase lets its postgres role create pgvector (supautils); pglite only
  -- lets a superuser, so create it here. The migration's
  -- "create extension if not exists" is then a no-op.
  create extension vector with schema extensions;

  -- Default privileges for objects the migration role creates, as Supabase
  -- has for its postgres role.
  alter default privileges for role ${MIGRATION_ROLE} in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges for role ${MIGRATION_ROLE} in schema public
    grant all on functions to anon, authenticated, service_role;
  alter default privileges for role ${MIGRATION_ROLE} in schema public
    grant all on sequences to anon, authenticated, service_role;
`;

/** A pglite data directory, as dumpDataDir returns and loadDataDir takes. */
export type PgliteDump = File | Blob;

function startPglite(dump?: PgliteDump): Promise<PGlite> {
  return PGlite.create({ extensions: { vector }, ...(dump ? { loadDataDir: dump } : {}) });
}

/** A database with the Supabase bootstrap and no migrations, as a dump. */
export async function bootstrapDump(): Promise<PgliteDump> {
  const db = await startPglite();
  try {
    await db.exec(SUPABASE_BOOTSTRAP);
    return await db.dumpDataDir("none");
  } finally {
    await db.close();
  }
}

/**
 * Applies one migration to `dump` in a fresh session (a new pglite instance,
 * so no extension library is loaded yet) as MIGRATION_ROLE. Resolves to the
 * new dump; rejects with the migration's error, naming `name`.
 */
export async function applyMigration(
  dump: PgliteDump,
  name: string,
  sql: string,
): Promise<PgliteDump> {
  const db = await startPglite(dump);
  try {
    await db.exec(`set role ${MIGRATION_ROLE}`);
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
    }
    await db.exec("reset role");
    return await db.dumpDataDir("none");
  } finally {
    await db.close();
  }
}

/** Migration files in apply order (their names start with a UTC timestamp). */
export async function listMigrations(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith(".sql")).sort();
}

export interface SupabasePglite {
  /**
   * The database, as pglite's superuser (for seeding and inspecting).
   * Migrations were applied as MIGRATION_ROLE, which owns what they created.
   */
  db: PGlite;
  /**
   * Run `fn` in a transaction as `role`, with JWT claims `{ sub, role }`
   * (`sub` omitted when null), the way PostgREST runs a request.
   * Commits if `fn` resolves, rolls back if it throws.
   */
  as<T>(role: SupabaseRole, sub: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Every migration in `dir`, applied one fresh session at a time. That costs
 * ~2 s per migration, so the result is cached in a private temp dir, keyed by a
 * hash of the bootstrap, each migration's name and SQL, and the installed
 * pglite packages (their resolved paths carry the versions): any change
 * rebuilds it, and the test files of one run share it.
 */
async function migratedDump(dir: string): Promise<PgliteDump> {
  const files = await listMigrations(dir);
  const sources = await Promise.all(files.map((f) => readFile(join(dir, f), "utf8")));
  const require = createRequire(import.meta.url);
  const hash = createHash("sha256")
    .update(require.resolve("@electric-sql/pglite"))
    .update(require.resolve("@electric-sql/pglite-pgvector"))
    .update(SUPABASE_BOOTSTRAP);
  files.forEach((f, i) => hash.update(`\0${f}\0${sources[i]}`));
  const cacheFile = join(CACHE_DIR, `${hash.digest("hex").slice(0, 32)}.tar`);

  try {
    return new Blob([await readFile(cacheFile)]);
  } catch {
    // Not built yet: build it below.
  }

  let dump = await bootstrapDump();
  for (const [i, file] of files.entries()) {
    dump = await applyMigration(dump, file, sources[i] ?? "");
  }
  // A new file ("wx": fails if anything, a symlink included, is already at
  // that path), then renamed into place, so a concurrent reader never sees
  // half a file.
  await mkdir(CACHE_DIR, { recursive: true });
  const partial = `${cacheFile}.${randomUUID()}.partial`;
  await writeFile(partial, Buffer.from(await dump.arrayBuffer()), { flag: "wx" });
  await rename(partial, cacheFile);
  return dump;
}

/** Start a fresh in-memory database with every migration applied. */
export async function createSupabasePglite(
  options: { migrationsDir?: string } = {},
): Promise<SupabasePglite> {
  const db = await startPglite(await migratedDump(options.migrationsDir ?? MIGRATIONS_DIR));

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
