import React, { useMemo, useState } from "react";
import { Eye, EyeOff, MoreHorizontal, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { confirmAction } from "@/components/ConfirmHost";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";

// Admin lists: Remove → "Hide from this list" (the record is kept, and comes
// back with Show hidden) or "Delete for good". Only administrators can do
// either; the server checks that too (entityAccess hidden_at).
// records: several rows shown as one entry (an inspection's items).
// onHide: a summary feed's own Hide (only off that feed, on this device),
// instead of hiding the record everywhere.
export function RemoveMenu({ entity, record, records, label = "this", onChanged, canDelete = true, deleteNote = "", onHide }) {
  const [busy, setBusy] = useState(false);
  const rows = (records || [record]).filter((r) => r?.id);
  if (!rows.length && !onHide) return null;
  const hidden = !onHide && rows.every((r) => r.hidden_at);
  const run = async (work, done) => {
    setBusy(true);
    try { await work(); toast({ title: done }); await onChanged?.(); }
    catch (e) { toast({ title: "Couldn't do that", description: e?.response?.data?.error || e?.message || "Try again.", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const each = async (work) => { for (const r of rows) await work(r); };
  const hide = () => {
    if (onHide) { onHide(); toast({ title: "Hidden from this list" }); return undefined; }
    const at = hidden ? null : new Date().toISOString();
    return run(() => each((r) => base44.entities[entity].update(r.id, { hidden_at: at })), hidden ? "Shown in the list again" : "Hidden from this list");
  };
  const remove = async () => {
    if (!(await confirmAction({
      title: `Delete ${label} for good?`,
      description: `It is deleted for everyone and can't be brought back.${deleteNote ? " " + deleteNote : ""} To only take it off this list, choose Hide instead.`,
      confirmLabel: "Delete for good",
    }))) return;
    run(() => each((r) => base44.entities[entity].delete(r.id)), "Deleted");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busy} aria-label={`Remove ${label}`} title="Remove" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={hide}>
          {hidden ? <Eye className="mr-2 h-4 w-4" aria-hidden="true" /> : <EyeOff className="mr-2 h-4 w-4" aria-hidden="true" />}
          {hidden ? "Show in this list again" : "Hide from this list"}
        </DropdownMenuItem>
        {canDelete && rows.length > 0 && (
          <DropdownMenuItem onSelect={remove} className="text-danger focus:text-danger">
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Delete for good
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A list's "Show hidden" switch, and the rows to show. Hiding is for the
// admin lists: anyone else (a mechanic's Faults) still sees every row.
export function useHiddenRows(rows = [], admin = true) {
  const [showHidden, setShowHidden] = useState(false);
  const hiddenCount = useMemo(() => rows.filter((r) => r?.hidden_at).length, [rows]);
  const visible = useMemo(() => (showHidden || !admin ? rows : rows.filter((r) => !r?.hidden_at)), [rows, showHidden, admin]);
  const toggle = hiddenCount > 0 || showHidden ? (
    <label className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
      <Switch checked={showHidden} onCheckedChange={setShowHidden} aria-label="Show hidden" />
      Show hidden ({hiddenCount})
    </label>
  ) : null;
  return { visible, toggle, showHidden };
}

// Hidden from one summary feed on this device (Recent activity, Needs
// attention): a list of keys kept in this browser, newest 300.
export function useFeedHidden(feed) {
  const storageKey = `tt_hidden_${feed}`;
  const [keys, setKeys] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { return new Set(); }
  });
  const hide = (key) => setKeys((prev) => {
    const next = new Set([...prev, key]);
    try { localStorage.setItem(storageKey, JSON.stringify([...next].slice(-300))); } catch { /* storage blocked: this visit only */ }
    return next;
  });
  const showAll = () => { setKeys(new Set()); try { localStorage.removeItem(storageKey); } catch { /* ignore */ } };
  return { isHidden: (key) => keys.has(key), hide, showAll, count: keys.size };
}
