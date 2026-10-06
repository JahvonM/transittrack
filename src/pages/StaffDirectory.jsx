import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, MessageCircle, Plus, Pencil, Trash2, Nfc, Search } from "lucide-react";
import { EmptyState, PageActions, Segmented, StatusChip } from "@/components/admin/kit";
import ContactFormDialog from "@/components/directory/ContactFormDialog";
import { useAuth } from "@/lib/AuthContext";
import { loadFailed } from "@/lib/loadFailed";
import BusLoader from "@/components/BusLoader";

// "staff" in the data = people from client companies who ride the buses.
const TYPE_LABEL = { all: "All", staff: "Company passengers", passenger: "Other passengers" };

export default function StaffDirectory() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const res = await base44.functions.invoke("nfcCards", { action: "directory" });
      setContacts((res.data?.people || []).map(p => ({ ...p, type: p.directory_type || (p.company_id ? "staff" : "passenger") })));
    } catch { loadFailed(); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const save = async (data) => {
    const payload = {
      ...data,
      company_id: data.company_id || user?.company_id,
      company_name: data.company_name || user?.company_name,
    };
    if (editing) await base44.entities.Contact.update(editing.id, payload);
    else await base44.entities.Contact.create(payload);
    setDialogOpen(false);
    load();
  };

  const remove = async (c) => {
    if (!(await confirmAction({ title: `Delete ${c.name}?`, description: "This contact will be removed from the directory." }))) return;
    await base44.entities.Contact.delete(c.id);
    load();
  };

  const waLink = (phone) => {
    const d = (phone || "").replace(/\D/g, "");
    return d ? `https://wa.me/${d}` : null;
  };

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Companies present in the directory, for the company filter.
  const companies = useMemo(() => {
    const map = new Map();
    for (const c of contacts) if (c.company_id) map.set(c.company_id, c.company_name || "Unnamed company");
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);
  const filtered = (filter === "all" ? contacts : contacts.filter((c) => c.type === filter))
    .filter((c) => companyFilter === "all" || c.company_id === companyFilter)
    .filter((c) => !q || [c.name, c.phone, c.email, c.pickup_name, c.dropoff_name, c.company_name].some((x) => String(x || "").toLowerCase().includes(q)));
  const place = (name, lat, lng) => name || (lat != null ? `${lat?.toFixed(4)}, ${lng?.toFixed(4)}` : "");

  return (
    <AppLayout title="Passenger directory">
      <PullToRefresh onRefresh={load}>
      <PageActions>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4" /> Add passenger
        </Button>
      </PageActions>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search passengers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or stop"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        {companies.length > 1 && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Company"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Segmented label="Passenger type" value={filter} onChange={setFilter} options={["all", "staff", "passenger"].map((t) => ({
          value: t, label: TYPE_LABEL[t], count: t === "all" ? contacts.length : contacts.filter((c) => c.type === t).length,
        }))} />
      </div>

      {loading ? (
        <BusLoader className="py-8" />
      ) : contacts.length === 0 ? (
        <EmptyState icon={Users} title="No passengers yet" action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add passenger</Button>}>
          Add the people who ride your buses so drivers and kiosks know them.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No passengers match">Try another search or type.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_252px] gap-4 border-b border-border px-4 py-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground lg:grid" aria-hidden="true">
            <span>Passenger</span><span>Contact</span><span>Pickup and drop-off</span><span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((c) => {
              const wa = waLink(c.phone);
              const pickup = place(c.pickup_name, c.pickup_lat, c.pickup_lng);
              const dropoff = place(c.dropoff_name, c.dropoff_lat, c.dropoff_lng);
              const initials = (c.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
              return (
                <li key={c.key} className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_252px] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-body-sm font-bold" aria-hidden="true">{initials}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <StatusChip tone={c.type === "staff" ? "info" : "neutral"} dot={false}>{TYPE_LABEL[c.type] || c.type}</StatusChip>
                        {c.status && c.status !== "Unassigned" && <StatusChip tone={c.status === "Card Issued" ? "success" : "warning"} dot={false}><Nfc className="h-3.5 w-3.5" aria-hidden="true" /> {c.status === "Card Issued" ? "Card issued" : c.status + " card"}</StatusChip>}
                        {c.registered && <StatusChip tone="neutral" dot={false}>Email account</StatusChip>}
                      </div>
                      {!c.company_id && <p className="mt-1 text-caption text-warning">Company membership needed before card issuing</p>}
                    </div>
                  </div>
                  <div className="min-w-0 text-body-sm">
                    {c.phone && <p className="truncate">{c.phone}</p>}
                    {c.email && <p className="truncate text-muted-foreground">{c.email}</p>}
                    {!c.phone && !c.email && <p className="text-muted-foreground">No contact details</p>}
                  </div>
                  <div className="min-w-0 text-body-sm">
                    <p className="truncate"><span className="text-muted-foreground">Pickup </span>{pickup || "Not set"}</p>
                    <p className="truncate"><span className="text-muted-foreground">Drop-off </span>{dropoff || "Not set"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:justify-end">
                    <Button asChild variant="outline" size="sm">
                      <Link to={(user?.role === "admin" ? "/admin/cards" : "/company/cards") + "?person=" + encodeURIComponent(c.key)}><Nfc className="h-4 w-4" /> {c.status === "Card Issued" ? "Manage card" : "Issue card"}</Link>
                    </Button>
                    {wa && (
                      <Button asChild variant="ghost" size="icon" title="WhatsApp">
                        <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${c.name}`}><MessageCircle className="h-4 w-4" /></a>
                      </Button>
                    )}
                    {c.source === "contact" && <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} title="Edit"><Pencil className="h-4 w-4" /></Button>}
                    {c.source === "contact" && <Button variant="ghost" size="icon" onClick={() => remove(c)} aria-label={`Delete ${c.name}`} title="Delete" className="text-danger hover:text-danger"><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ContactFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={save}
        contact={editing}
      />
      </PullToRefresh>
    </AppLayout>
  );
}