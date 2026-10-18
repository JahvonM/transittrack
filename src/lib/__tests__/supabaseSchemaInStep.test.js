import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { desiredTables, appliedSchema, schemaChanges, tableOf } from "../../../tools/supabase/schema-lib.mjs";
import { SUPABASE_TABLES } from "../../../base44/shared/supabaseTables.ts";

// TransitTrack is moving to Supabase. While both run, every Base44 entity
// needs a matching Supabase table and column, or Admin -> Copy data to
// Supabase leaves it behind. When this fails after an entity change, run:
//   node tools/supabase/gen-schema.mjs --name <what_changed>
// and commit the new file in supabase/migrations.

describe("Supabase tables keep up with the Base44 entities", () => {
  it("has a table and column for every entity field", () => {
    const { summary, empty } = schemaChanges();
    expect(summary.warnings).toEqual([]);
    expect(empty, `Supabase is behind: ${JSON.stringify(summary)}. Run node tools/supabase/gen-schema.mjs --name <what_changed>`).toBe(true);
  });

  it("copies every entity", () => {
    expect(Object.keys(SUPABASE_TABLES).sort()).toEqual(desiredTables().map((t) => t.entity).sort());
  });

  it("only adds: a new field becomes one column, an enum change replaces its check, nothing is dropped", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-schema-"));
    const ent = path.join(dir, "entities");
    const mig = path.join(dir, "migrations");
    fs.mkdirSync(ent); fs.mkdirSync(mig);
    const write = (props, required = []) => fs.writeFileSync(path.join(ent, "Client.jsonc"), JSON.stringify({ name: "Client", properties: props, required }));
    // A second table whose name starts the same way must not be touched.
    fs.writeFileSync(path.join(ent, "ClientError.jsonc"), JSON.stringify({ name: "ClientError", properties: { status: { type: "string", enum: ["new", "seen"] } }, required: ["status"] }));
    write({ status: { type: "string", enum: ["a", "b"] }, name: { type: "string" } }, ["name"]);
    const first = schemaChanges(desiredTables(ent), appliedSchema(mig));
    expect(first.summary.newTables).toEqual(["Client", "ClientError"]);
    expect(first.sql).toMatch(/create or replace function public\.new_id\(\)/);
    expect(first.sql.match(/enable row level security/g)).toHaveLength(2);
    fs.writeFileSync(path.join(mig, "1_first.sql"), first.sql);
    // Running the generator again finds nothing to do.
    expect(schemaChanges(desiredTables(ent), appliedSchema(mig)).empty).toBe(true);

    write({ status: { type: "string", enum: ["a", "b", "c"] }, name: { type: "string" }, phone: { type: "string" }, client_id: { type: "string" } });
    const second = schemaChanges(desiredTables(ent), appliedSchema(mig));
    expect(second.summary.newTables).toEqual([]);
    expect(second.summary.newColumns).toEqual(["Client.phone", "Client.client_id"]);
    expect(second.summary.checks).toEqual(["update client_status_allowed", "drop client_name_required"]);
    expect(second.sql).toMatch(/add column if not exists phone text;/);
    expect(second.sql).not.toMatch(/drop (table|column)/);
    expect(second.sql).not.toMatch(/client_error/);
    fs.writeFileSync(path.join(mig, "2_second.sql"), second.sql);
    expect(schemaChanges(desiredTables(ent), appliedSchema(mig)).empty).toBe(true);
  });

  it("keeps Postgres-reserved names usable", () => {
    expect(tableOf("User")).toBe("app_user");
    expect(tableOf("RouteTravelTimes")).toBe("route_travel_times");
  });
});
