// Runs base44/functions/nfcCards/entry.ts against an in-memory database.
import fs from "node:fs";
import { transform } from "esbuild";

const src = fs.readFileSync("base44/functions/nfcCards/entry.ts", "utf8")
  .replace(/import \{ createClientFromRequest \} from '[^']+';/, "const createClientFromRequest = (req) => globalThis.__client(req);");
const { code } = await transform(src, { loader: "ts", format: "esm" });
fs.writeFileSync("/tmp/nfc_fn.mjs", code);
const fn = (await import("/tmp/nfc_fn.mjs?" + Date.now())).default;

let seq = 0;
const db = {
  Driver: [{ id: "d1", full_name: "Marcus Reid", email: "marcus@x.com", company_id: "c1", company_name: "Island Transit", employee_id: "DRV-014" }],
  User: [
    { id: "u1", full_name: "Andre Felix", email: "andre@x.com", role: "mechanic", company_id: "c1" },
    { id: "u2", full_name: "Kevin Paul", email: "kevin@x.com", role: "staff", company_id: "c1" },
    { id: "u3", full_name: "Orphan Staff", email: "orphan@x.com", role: "staff", company_id: "c2", nfc_tag_id: "04LEGACY0000" },
    { id: "a1", full_name: "Ana Admin", email: "ana@x.com", role: "admin" },
    { id: "m9", full_name: "Mgr Two", email: "mgr@x.com", role: "company", company_id: "c2" },
  ],
  Contact: [{ id: "s1", name: "Kevin Paul", email: "kevin@x.com", type: "staff", company_id: "c1", nfc_card_tag: "04KEVIN00001" }],
  CardHolder: [{ id: "h1", full_name: "Lisa Noel", role: "Dispatcher", company_id: "c1" }],
  Vehicle: [{ id: "v1", name: "Bus 12", fleet_number: "BUS-012", driver_email: "marcus@x.com" }],
  NfcCard: [], AuditLog: [], Company: [{ id: "c1", name: "Island Transit" }],
};
const match = (rec, q) => Object.entries(q).every(([k, v]) => rec[k] === v);
const ent = (name) => ({
  list: async () => [...db[name]],
  filter: async (q) => db[name].filter((r) => match(r, q)),
  get: async (id) => { const r = db[name].find((x) => x.id === id); if (!r) throw new Error("not found"); return { ...r }; },
  create: async (data) => { const r = { id: name + ++seq, created_date: new Date().toISOString(), ...data }; db[name].push(r); return r; },
  update: async (id, data) => { const r = db[name].find((x) => x.id === id); Object.assign(r, data); return { ...r }; },
});
const entities = new Proxy({}, { get: (_, n) => ent(n) });
let me = db.User.find((u) => u.id === "a1");
globalThis.__client = () => ({ auth: { me: async () => me }, asServiceRole: { entities } });
const call = async (body) => { const res = await fn(new Request("http://x", { method: "POST", body: JSON.stringify(body) })); return { status: res.status, ...(await res.json()) }; };

const out = {};
let r = await call({ action: "people" });
out.people = r.people.map((p) => `${p.name}:${p.role}:${p.status}`).join(" | ");
out.driverBus = r.people.find((p) => p.key === "driver:d1").assigned_vehicle;
r = await call({ action: "issue", person_key: "driver:d1", uid: "04:a2:8b:22:6f:1c:80", card_type: "MIFARE Classic 1K", access_level: "DEPOT_DRIVER_ZONE" });
out.issue = `${r.ok} uid=${r.card?.card_uid} emp=${r.card?.employee_id} access=${r.card?.access_level}`;
out.driverTagLinked = db.Driver[0].nfc_card_uid;
r = await call({ action: "issue", person_key: "user:u1", uid: "04A28B226F1C80" });
out.duplicate = `${r.ok} ${r.code}: ${r.error}`;
r = await call({ action: "issue", person_key: "user:u1", uid: "04KEVIN00001".replace(/[^0-9A-F]/g, "") || "x" });
r = await call({ action: "issue", person_key: "user:u1", uid: "04BEEF000001" });
out.mechanicIssued = `${r.ok} userTag=${db.User[0].nfc_tag_id}`;
db.Contact[0].nfc_card_tag = "04C0FFEE0001";
r = await call({ action: "issue", person_key: "cardholder:h1", uid: "04C0FFEE0001" });
out.legacyKioskCardRefused = `${r.ok} ${r.code}: ${r.error}`;
r = await call({ action: "issue", person_key: "driver:d1", uid: "04D00D000002" });
out.reissueReplaces = `${r.ok} replaced=${r.replaced} old=${db.NfcCard.find((c) => c.card_uid === "04A28B226F1C80").revoke_reason}`;
r = await call({ action: "issue", person_key: "driver:d1", uid: "04D00D000002" });
out.sameCardAgain = `${r.ok} ${r.code}`;
r = await call({ action: "verify", uid: "04D00D000002" });
out.verify = r.owner?.name;
r = await call({ action: "verify", uid: "04FFFFFFFF01" });
out.verifyUnknown = r.owner === null;
const active = db.NfcCard.find((c) => c.card_uid === "04D00D000002");
r = await call({ action: "revoke", card_id: active.id, reason: "Lost" });
out.revoke = `${r.ok} active=${db.NfcCard.find((c) => c.id === active.id).is_active} driverTag='${db.Driver[0].nfc_card_uid}'`;
r = await call({ action: "people" });
out.statusAfterRevoke = r.people.find((p) => p.key === "driver:d1").status;
r = await call({ action: "issue", person_key: "user:u1", uid: "12" });
out.badUid = `${r.ok} ${r.code}`;
r = await call({ action: "add_holder", full_name: "Tom Inspector", role: "Inspector", employee_id: "INS-9", company_id: "c1" });
out.addHolder = `${r.ok} ${r.holder?.role} ${r.holder?.company_name}`;
r = await call({ action: "keypad_code", person_key: "contact:s1" });
out.keypadForStaff = r.ok + " " + r.code + " saved=" + (db.Contact[0].access_code === r.code) + " 5digits=" + /^[0-9]{5}$/.test(r.code);
r = await call({ action: "keypad_code", person_key: "driver:d1" });
out.keypadForDriverRefused = r.status + " " + r.error;
// company manager of c2 only sees c2 people and can't issue to c1 people
me = db.User.find((u) => u.id === "m9");
r = await call({ action: "people" });
out.companyScope = r.people.map((p) => p.name).join(",");
r = await call({ action: "issue", person_key: "driver:d1", uid: "04ABCDEF0101" });
out.companyCantIssueOther = `${r.status} ${r.code}`;
me = null;
r = await call({ action: "people" });
out.anonymous = r.status;
out.auditActions = db.AuditLog.map((a) => `${a.action}/${a.status}`).join(", ");
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(24), v);
