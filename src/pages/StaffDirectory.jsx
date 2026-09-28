import React, { useEffect, useState } from "react";
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

export default function StaffDirectory() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    base44.entities.Contact.list("-updated_date", 200).then((c) => {
      setContacts(c);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    // Apply realtime updates incrementally (mirrors Notifications.jsx) instead
    // of re-fetching the whole list on every single event.
    const unsub = base44.entities.Contact.subscribe((event) => {
      if (event.type === "delete") {
        setContacts((prev) => prev.filter((c) => c.id !== event.id));
        return;
      }
      if (!event.data) return;
      setContacts((prev) => {
        const idx = prev.findIndex((c) => c.id === event.data.id);
        return idx === -1 ? [event.data, ...prev] : prev.map((c) => (c.id === event.data.id ? event.data : c));
      });
    });
    return unsub;
  }, []);

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
    <AppLayout title="Staff & passenger directory">
      <PullToRefresh onRefresh={load}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          {["all", "staff", "passenger"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm border capitalize transition-colors ${
                filter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
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
              <Card key={c.id}>
                <CardContent className="py-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> {c.name}
                    </div>
                    <Badge
                      variant={c.type === "staff" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {c.type}
                    </Badge>
                  </div>
                  {c.phone && <div className="text-muted-foreground">{c.phone}</div>}
                  {c.email && (
                    <div className="text-muted-foreground text-xs">{c.email}</div>
                  )}
                  {c.nfc_card_tag && (
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <Nfc className="w-3.5 h-3.5 text-primary" /> {c.nfc_card_tag}
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
                    <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(c)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
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