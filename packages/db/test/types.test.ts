import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { TABLES } from "./fixtures";

// Guards against a migration landing without regenerated types: every
// table's Row type in types.ts must list exactly the table's columns, with
// the same nullability. If it fails, regenerate types.ts (see PR #8 for how)
// rather than editing it by hand.

let s: SupabasePglite;
let typesSource: string;

beforeAll(async () => {
  s = await createSupabasePglite();
  typesSource = await readFile(new URL("../types.ts", import.meta.url), "utf8");
});

afterAll(async () => {
  await s.close();
});

/** `column: type` lines of a table's Row block in types.ts. */
function rowFields(table: string): Record<string, string> {
  const block = new RegExp(
    `\\n      ${table}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`,
  ).exec(typesSource)?.[1];
  if (!block) throw new Error(`No Row type for ${table} in types.ts`);
  return Object.fromEntries(
    block.split("\n").map((line) => {
      const [name, type] = line.trim().split(/:\s+/);
      return [name, type];
    }),
  );
}

describe("types.ts", () => {
  it("lists exactly the public tables", async () => {
    const { rows } = await s.db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(rows.map((r) => r.tablename)).toEqual([...TABLES].sort());
  });

  it.each(TABLES)("has the columns and nullability of %s", async (table) => {
    const { rows } = await s.db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = $1`,
      [table],
    );
    const fields = rowFields(table);
    expect(Object.keys(fields).sort()).toEqual(rows.map((r) => r.column_name).sort());
    for (const r of rows) {
      expect(fields[r.column_name]?.endsWith("| null"), r.column_name).toBe(
        r.is_nullable === "YES",
      );
    }
  });
});
