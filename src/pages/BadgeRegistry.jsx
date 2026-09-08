import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Check, Link2, Search, Unlink, UserCircle2 } from "lucide-react";

export default function BadgeRegistry() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.User.list();
    setUsers(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.full_name, u.email, u.nfc_tag_id].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [users, query]);

  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const linkedCount = users.filter((u) => u.nfc_tag_id).length;

  const startEdit = (u) => {
    setDrafts((d) => ({ ...d, [u.id]: u.nfc_tag_id || "" }));
  };

  const cancelEdit = (u) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[u.id];
      return next;
    });
  };

  const save = async (u) => {
    const value = (drafts[u.id] || "").trim();
    setSavingId(u.id);
    try {
      await base44.entities.User.update(u.id, { nfc_tag_id: value || null });
      setUsers((list) =>
        list.map((x) => (x.id === u.id ? { ...x, nfc_tag_id: value || null } : x))
      );
      setDrafts((d) => {
        const next = { ...d };
        delete next[u.id];
        return next;
      });
      toast({
        title: value ? "Badge linked" : "Badge unlinked",
        description: value
          ? `${u.full_name || u.email} → ${value}`
          : `Cleared badge for ${u.full_name || u.email}`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't save",
        description: "You may not have permission to edit this user.",
      });
    } finally {
      setSavingId(null);
    }
  };

  const unlink = async (u) => {
    setSavingId(u.id);
    try {
      await base44.entities.User.update(u.id, { nfc_tag_id: null });
      setUsers((list) =>
        list.map((x) => (x.id === u.id ? { ...x, nfc_tag_id: null } : x))
      );
      toast({ title: "Badge unlinked", description: u.full_name || u.email });
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't unlink",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppLayout title="Badge Registry">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                NFC Badge Registry
              </span>
              <Badge variant="secondary">
                {linkedCount}/{users.length} linked
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search staff, email, or badge ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading staff…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff match your search.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((u) => {
                  const isEditing = drafts[u.id] !== undefined;
                  const hasBadge = !!u.nfc_tag_id;
                  return (
                    <div
                      key={u.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border bg-card"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
                          <UserCircle2 className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {u.full_name || u.email}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.email}
                            {u.role ? ` · ${u.role}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:w-72">
                        {isEditing ? (
                          <>
                            <Input
                              autoFocus
                              value={drafts[u.id]}
                              onChange={(e) =>
                                setDrafts((d) => ({ ...d, [u.id]: e.target.value }))
                              }
                              placeholder="e.g. 04A9F2B3"
                              className="font-mono text-sm"
                            />
                            <Button
                              size="icon"
                              variant="default"
                              disabled={savingId === u.id}
                              onClick={() => save(u)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={savingId === u.id}
                              onClick={() => cancelEdit(u)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            {hasBadge ? (
                              <Badge className="font-mono" variant="default">
                                {u.nfc_tag_id}
                              </Badge>
                            ) : (
                              <Badge variant="outline">No badge</Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(u)}
                            >
                              {hasBadge ? "Edit" : "Link badge"}
                            </Button>
                            {hasBadge && (
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={savingId === u.id}
                                onClick={() => unlink(u)}
                              >
                                <Unlink className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}