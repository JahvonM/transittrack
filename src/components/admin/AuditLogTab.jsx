import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MobileSelect } from "@/components/ui/mobile-select";
import BusLoader from "@/components/BusLoader";
import EmptyState from "@/components/EmptyState";
import { loadFailed } from "@/lib/loadFailed";

const ACTION_VARIANT = {
  create: "default", update: "secondary", delete: "destructive",
  card_programmed: "default", card_verified: "secondary", card_rejected: "destructive", card_revoked: "destructive",
};
const ACTION_LABEL = {
  create: "Created", update: "Edited", delete: "Deleted",
  card_programmed: "Card issued", card_verified: "Card checked", card_rejected: "Card refused", card_revoked: "Card revoked",
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

function Changes({ json }) {
  if (!json) return null;
  let obj = null;
  try { obj = JSON.parse(json); } catch { return <p className="text-xs text-muted-foreground break-all">{json}</p>; }
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
      {entries.slice(0, 12).map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-all">{v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// Who changed what, and when. Written by src/lib/auditLog.js for every
// create/edit/delete made by a signed-in admin, company, mechanic or staff user.
export default function AuditLogTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);

  const load = async () => {
    try {
      setRows(await base44.entities.AuditLog.list("-created_date", 500));
    } catch {
      loadFailed(load);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const entities = useMemo(() => [...new Set(rows.map((r) => r.entity))].sort(), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      (entity === "all" || r.entity === entity) &&
      (!q || [r.actor_email, r.actor_name, r.summary, r.record_id, r.entity].some((v) => (v || "").toLowerCase().includes(q)))
    );
  }, [rows, entity, query]);

  if (loading) return <BusLoader className="py-8" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Change history</h2>
        <p className="text-sm text-muted-foreground">Every create, edit and delete made from the dashboards, newest first. PINs and codes are hidden.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, record or type" className="max-w-xs" />
        <MobileSelect
          value={entity}
          onValueChange={setEntity}
          options={[{ value: "all", label: "All record types" }, ...entities.map((e) => ({ value: e, label: e }))]}
          triggerClassName="w-auto min-w-[180px]"
        />
      </div>
      {!shown.length ? (
        <EmptyState text={rows.length ? "No changes match these filters." : "No changes recorded yet. Edits made from now on will show up here."} />
      ) : (
        <div className="rounded-2xl border border-border divide-y divide-border bg-card">
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left p-3 hover:bg-muted/40 transition-colors">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ACTION_VARIANT[r.action] || "secondary"}>{ACTION_LABEL[r.action] || r.action}</Badge>
                <span className="font-medium">{r.entity}</span>
                {r.summary && <span className="truncate max-w-[40ch]">· {r.summary}</span>}
                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{fmt(r.created_date)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {r.actor_name || r.actor_email || "Unknown"}{r.actor_role ? ` (${r.actor_role})` : ""}
                {r.record_id ? ` · id ${r.record_id}` : ""}
              </div>
              {open === r.id && <Changes json={r.changes} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
