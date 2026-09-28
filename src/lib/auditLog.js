// Change history: wraps base44.entities so every create / update / delete made
// by a signed-in admin, company, mechanic or staff user also writes an
// AuditLog row (fire-and-forget, never blocks or fails the real write).
// Kiosk and driver-tablet actions go through backend functions instead, so
// they aren't recorded here.

const LOGGED_ROLES = new Set(["admin", "company", "mechanic", "staff"]);
// High-volume or self-describing records that would drown the log.
const SKIP = new Set(["AuditLog", "ClientError", "PushToken", "LocationPing", "GroupMessage", "DrivingEvent", "Broadcast", "StaffCheckIn"]);
const WRITES = new Set(["create", "update", "delete", "bulkCreate", "updateMany", "deleteMany"]);
const SECRET_FIELDS = /pin|code|password|token|secret/i;

let actor = null;
export function setAuditActor(user) {
  actor = user && LOGGED_ROLES.has(user.role) ? user : null;
}

const label = (obj) =>
  (obj && (obj.name || obj.title || obj.full_name || obj.staff_name || obj.email || obj.plate_number || obj.pickup_name)) || "";

function describe(data) {
  if (!data || typeof data !== "object") return "";
  const safe = {};
  for (const [k, v] of Object.entries(data)) {
    if (SECRET_FIELDS.test(k)) safe[k] = v ? "••••" : v;
    else if (typeof v === "string" && v.length > 120) safe[k] = v.slice(0, 117) + "…";
    else if (Array.isArray(v)) safe[k] = `[${v.length} items]`;
    else safe[k] = v;
  }
  const json = JSON.stringify(safe);
  return json.length > 1500 ? json.slice(0, 1497) + "…" : json;
}

export function withAuditLog(rawEntities) {
  const record = (entity, method, args, result) => {
    if (!actor) return;
    let action = "update";
    let recordId = "";
    let summary = "";
    let changes = "";
    if (method === "create") {
      action = "create"; recordId = result?.id || ""; summary = label(result || args[0]); changes = describe(args[0]);
    } else if (method === "update") {
      recordId = String(args[0] || ""); summary = label(result) || label(args[1]); changes = describe(args[1]);
    } else if (method === "delete") {
      action = "delete"; recordId = String(args[0] || "");
    } else if (method === "bulkCreate") {
      action = "create"; summary = `${Array.isArray(args[0]) ? args[0].length : 0} records`;
    } else if (method === "updateMany") {
      summary = `Records matching ${describe(args[0])}`; changes = describe(args[1]);
    } else if (method === "deleteMany") {
      action = "delete"; summary = `Records matching ${describe(args[0])}`;
    }
    rawEntities.AuditLog.create({
      actor_email: actor.email || "",
      actor_name: actor.full_name || "",
      actor_role: actor.role || "",
      action,
      entity,
      record_id: recordId,
      summary: String(summary).slice(0, 200),
      changes,
      page: typeof window !== "undefined" ? window.location.pathname : "",
    }).catch(() => {});
  };

  return new Proxy({}, {
    get(_, entity) {
      const handler = rawEntities[entity];
      if (!handler || typeof entity !== "string" || SKIP.has(entity)) return handler;
      return new Proxy(handler, {
        get(target, method) {
          const fn = target[method];
          if (typeof fn !== "function" || !WRITES.has(method)) return fn;
          return async (...args) => {
            const result = await fn.apply(target, args);
            try { record(entity, method, args, result); } catch { /* never break the real write */ }
            return result;
          };
        },
      });
    },
  });
}
