import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { confirmAction } from "@/components/ConfirmHost";
import { base44 } from "@/api/base44Client";
import AppLayout from "@/components/AppLayout";
import PullToRefresh from "@/components/PullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  MessageCircle,
  Plus,
  Pencil,
  Trash2,
  Nfc,
  MapPin,
} from "lucide-react";
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

  const filtered = filter === "all" ? contacts : contacts.filter((c) => c.type === filter);

  return (
    <AppLayout title="Passenger directory">
      <PullToRefresh onRefresh={load}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {["all", "staff", "passenger"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                filter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {loading ? (
        <BusLoader className="py-8" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No contacts yet. Click "Add" to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const wa = waLink(c.phone);
            return (
              <Card key={c.key}>
                <CardContent className="py-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> {c.name}
                    </div>
                    <Badge
                      variant={c.type === "staff" ? "default" : "secondary"}
                    >
                      {TYPE_LABEL[c.type] || c.type}
                    </Badge>
                  </div>
                  {c.registered && <Badge variant="outline">Email account</Badge>}
                  {!c.company_id && <p className="text-xs text-amber-600">Company membership needed before card issuing</p>}
                  {c.phone && <div className="text-muted-foreground">{c.phone}</div>}
                  {c.email && (
                    <div className="text-muted-foreground text-xs">{c.email}</div>
                  )}
                  {c.status === "Card Issued" && (
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <Nfc className="w-3.5 h-3.5 text-primary" /> Card issued
                    </div>
                  )}
                  {(c.pickup_name || c.pickup_lat != null) && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" /> Pickup:{" "}
                      {c.pickup_name ||
                        `${c.pickup_lat?.toFixed(4)}, ${c.pickup_lng?.toFixed(4)}`}
                    </div>
                  )}
                  {(c.dropoff_name || c.dropoff_lat != null) && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" /> Drop-off:{" "}
                      {c.dropoff_name ||
                        `${c.dropoff_lat?.toFixed(4)}, ${c.dropoff_lng?.toFixed(4)}`}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    {c.source === "contact" && <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>}
                    {c.source === "contact" && <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(c)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>}
                    <Button asChild variant="outline" size="sm"><Link to={(user?.role === "admin" ? "/admin/cards" : "/company/cards") + "?person=" + encodeURIComponent(c.key)}><Nfc className="w-3.5 h-3.5" /> Issue card</Link></Button>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1.5 text-emerald-500 text-xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
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