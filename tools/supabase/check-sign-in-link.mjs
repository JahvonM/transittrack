// Checks the sign-in linking rule (supabase/migrations/*_link_sign_in_accounts.sql)
// on a throwaway local Postgres (PGlite), never on the real project:
//   node tools/supabase/check-sign-in-link.mjs <path to node_modules with @electric-sql/pglite>
// A stand-in auth.users table plays Supabase Auth.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const modules = process.argv[2] || path.join(root, "node_modules");
const { PGlite } = createRequire(path.join(modules, "x.js"))("@electric-sql/pglite");
const db = new PGlite();

const migration = fs.readdirSync(path.join(root, "supabase/migrations")).find((f) => f.endsWith("_link_sign_in_accounts.sql"));
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
  create table public.app_user (id text primary key default md5(random()::text), email text, full_name text, role text, is_verified boolean, auth_user_id uuid unique);
`);
await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", migration), "utf8"));
// Safe to run twice.
await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", migration), "utf8"));

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const results = [];
const check = (name, ok) => { results.push(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) process.exitCode = 1; };
const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";

await db.query(`insert into public.app_user (id, email, role) values ('admin1', 'Boss@Example.com', 'admin')`);
await db.query(`insert into auth.users (id, email) values ($1, 'boss@example.com')`, [A]);
check("an unconfirmed sign-up with someone's email is not linked", (await one(`select auth_user_id from public.app_user where id = 'admin1'`)).auth_user_id === null);

await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [A]);
const linked = await one(`select auth_user_id, role from public.app_user where id = 'admin1'`);
check("once the email is confirmed it links, ignoring case", linked.auth_user_id === A);
check("the person keeps their role", linked.role === "admin");

await db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, 'new@example.com', now(), '{"full_name":"New Person","role":"admin"}')`, [B]);
const fresh = await one(`select role, full_name, is_verified from public.app_user where auth_user_id = $1`, [B]);
check("someone new gets a plain user row, whatever role they typed", fresh?.role === "user" && fresh.full_name === "New Person" && fresh.is_verified === true);

await db.query(`update auth.users set email = 'boss.new@example.com' where id = $1`, [A]);
check("a changed sign-in email keeps the link and updates the person", (await one(`select email from public.app_user where id = 'admin1'`)).email === "boss.new@example.com");

await db.query(`insert into public.app_user (id, email, role) values ('staff1', 'staff@example.com', 'staff')`);
await db.query(`update public.app_user set auth_user_id = $1 where id = 'staff1'`, [C]).catch(() => {});
await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'other@example.com', now())`, [C]).catch(() => {});
const rows = Number((await one(`select count(*) as n from public.app_user`)).n);
check("one row per person (no duplicates made)", rows === 3 || rows === 4);

await db.query(`delete from auth.users where id = $1`, [B]);
const left = await one(`select auth_user_id from public.app_user where email = 'new@example.com'`);
check("deleting a sign-in account leaves the person, unlinked", left && left.auth_user_id === null);

let dup = false;
try { await db.query(`insert into public.app_user (id, email) values ('x', 'NEW@example.com')`); } catch { dup = true; }
check("two people can't share an email", dup);

console.log(results.join("\n"));
