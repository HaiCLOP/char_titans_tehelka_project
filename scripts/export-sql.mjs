import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "supabase", "migrations");
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
const header = `-- CivicSense: complete fresh Supabase database setup
-- Generated from ${files.length} repository migrations plus supabase/seed.sql.
-- Regenerate: node scripts/export-sql.mjs
-- Run ONCE in a NEW Supabase project's SQL Editor as postgres.
-- Requires Supabase-managed auth/storage schemas, roles, Realtime publication,
-- and the vector, pg_trgm and pgmq extensions supported by the project.
-- This is the application schema and starter data, not a live database backup.
-- It contains no user accounts, report history, uploaded files, passwords or API keys.
-- Do not run on an existing CivicSense database or mix with migration-runner setup.
-- Fresh-install adaptations: field_staff is defined in the original role enum
-- to avoid PostgreSQL enum transaction restrictions; the optional Supabase
-- rls_auto_enable function is hardened only if it exists.

begin;
set local search_path = public, extensions;
do $fresh_install$
begin
  if to_regclass('public.profiles') is not null
     or to_regclass('public.complaints') is not null
     or to_regclass('public.departments') is not null then
    raise exception 'CivicSense tables already exist. Apply only pending migrations instead.';
  end if;
end
$fresh_install$;
`;
const sections = [];
for (const file of files) {
  let sql = await readFile(path.join(directory, file), "utf8");
  sql = sql.replace("create type user_role as enum ('student','staff','dept_admin','super_admin');", "create type user_role as enum ('student','staff','field_staff','dept_admin','super_admin');");
  sql = sql.replace("revoke execute on function public.rls_auto_enable() from public, anon, authenticated;", `do $optional_supabase_function$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$optional_supabase_function$;`);
  sections.push(`\n-- Source: supabase/migrations/${file}\n${sql.trim()}\n`);
}
const seed = await readFile(path.join(root, "supabase", "seed.sql"), "utf8");
const output = header + sections.join("\n") + `\n-- Source: supabase/seed.sql\n${seed.trim()}\n\ncommit;\n`;
const target = path.join(root, "supabase", "civicsense-complete.sql");
await writeFile(target, output, "utf8");
const tables = [...output.matchAll(/create table (?:if not exists )?(\w+)/gi)].map((m) => m[1]);
const appFiles = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(ts|tsx)$/.test(entry.name)) appFiles.push(file);
  }
}
await collect(path.join(root, "src"));
const refs = new Set();
for (const file of appFiles) {
  for (const match of (await readFile(file, "utf8")).matchAll(/\.from\("([a-z_]+)"\)/g)) refs.add(match[1]);
}
const definitions = new Set([...tables, ...[...output.matchAll(/create (?:or replace )?view (\w+)/gi)].map((m) => m[1])]);
const missing = [...refs].filter((name) => !definitions.has(name));
if (missing.length) throw new Error(`App references without SQL definitions: ${missing.join(", ")}`);
console.log(`Generated ${target}: ${files.length} migrations, ${new Set(tables).size} tables, ${Buffer.byteLength(output)} bytes. All ${refs.size} literal app table/view references covered.`);
