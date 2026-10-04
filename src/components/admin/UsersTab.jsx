import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { FileSpreadsheet, FileText, KeyRound, Search, Trash2, UserPlus, Users } from "lucide-react";
import { EmptyState, PageActions, Segmented } from "@/components/admin/kit";

const ROLE_LABEL = { company: "Company", driver: "Driver", staff: "Hotel staff", mechanic: "Mechanic", admin: "Admin" };
import { exportToCSV, exportToPDF } from "@/lib/exporters";

const USER_COLS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "company_id", label: "Company ID" },
  { key: "created_date", label: "Created" },
];

const EMPTY_ACCOUNT = { email: "", password: "", full_name: "", phone: "", role: "staff", company_id: "" };

function CreateAccountDialog({ companies, onCreated }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!form.email.trim() || form.password.length < 8) return;
    setCreating(true);
    try {
      await base44.auth.register({ email: form.email.trim(), password: form.password });
      // register() only takes email/password — attach role/profile fields
      // to the record it just created.
      const matches = await base44.entities.User.filter({ email: form.email.trim() });
      const created = Array.isArray(matches) ? matches[0] : matches;
      if (created) {
        const patch = { role: form.role };
        if (form.full_name.trim()) patch.full_name = form.full_name.trim();
        if (form.phone.trim()) patch.phone = form.phone.trim();
        if (form.role === "company" && form.company_id) patch.company_id = form.company_id;
        await base44.entities.User.update(created.id, patch);
      }
      toast({
        title: "Account created",
        description: "They sign in with the email and password you set, once they verify the one-time code emailed to them.",
      });
      setForm(EMPTY_ACCOUNT);
      setOpen(false);
      onCreated();
    } catch (e) {
      toast({ title: "Couldn't create account", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <KeyRound className="w-4 h-4" /> Create account
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Create account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Set their email and password directly instead of sending an invite link. They'll still need to
            enter a one-time code emailed to them the first time they sign in.
          </p>
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 473-..." />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(r) => setForm({ ...form, role: r })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="staff">Hotel staff</SelectItem>
                <SelectItem value="mechanic">Mechanic</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.role === "company" && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select value={form.company_id || "none"} onValueChange={(c) => setForm({ ...form, company_id: c === "none" ? "" : c })}>
                <SelectTrigger><SelectValue placeholder="Approve company access" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No approved company</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button className="w-full" onClick={create} disabled={creating || !form.email.trim() || form.password.length < 8}>
            {creating ? "Creating…" : "Create account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersTab({ users, companies, currentUser, onChange }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviting, setInviting] = useState(false);

  const setRole = async (u, role) => {
    await base44.entities.User.update(u.id, { role });
    onChange();
  };
  const setCompany = async (u, companyId) => {
    await base44.entities.User.update(u.id, { company_id: companyId === "none" ? null : companyId });
    onChange();
  };
  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      onChange();
    } finally {
      setInviting(false);
    }
  };
  const removeUser = async (u) => {
    await base44.entities.User.delete(u.id);
    onChange();
  };

  const [query, setQuery] = useState("");
  const [role, setRoleFilter] = useState("all");
  const q = query.trim().toLowerCase();
  const shown = users
    .filter((u) => role === "all" || u.role === role)
    .filter((u) => !q || [u.full_name, u.email].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  const roleCount = (r) => users.filter((u) => u.role === r).length;
  const companyName = (id) => companies.find((c) => c.id === id)?.name;

  return (
    <div>
      <PageActions>
        <Button size="sm" variant="outline" onClick={() => exportToCSV("users", USER_COLS, users)} disabled={!users.length}>
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportToPDF("users", "Users and roles", USER_COLS, users)} disabled={!users.length}>
          <FileText className="h-4 w-4" /> PDF
        </Button>
        <CreateAccountDialog companies={companies} onCreated={onChange} />
      </PageActions>

      <section className="mb-4 rounded-2xl border border-border bg-card p-4" aria-label="Invite a user">
        <h2 className="mb-3 flex items-center gap-2 text-title-sm font-bold"><UserPlus className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" /> Invite someone</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="name@example.com"
            aria-label="Email to invite"
            className="h-10 min-w-[200px] flex-1"
          />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="h-10 w-[150px]" aria-label="Role for the invite"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? "Inviting…" : "Send invite"}
          </Button>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <Segmented label="Filter by role" value={role} onChange={setRoleFilter} options={[
          { value: "all", label: "All", count: users.length },
          ...Object.entries(ROLE_LABEL).map(([v, l]) => ({ value: v, label: l, count: roleCount(v) })),
        ]} />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Users} title={users.length ? "No users match" : "No users yet"}>{users.length ? "Try another search or role." : "Invite someone to get started."}</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_160px_minmax(0,1fr)_44px] gap-4 border-b border-border px-4 py-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground md:grid" aria-hidden="true">
            <span>User</span><span>Role</span><span>Company access</span><span />
          </div>
          <ul className="divide-y divide-border">
            {shown.map((u) => {
              const initials = (u.full_name || u.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
              const label = u.full_name || u.email;
              return (
                <li key={u.id} className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_160px_minmax(0,1fr)_44px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-body-sm font-bold" aria-hidden="true">{initials}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{label}{u.id === currentUser?.id && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
                      <p className="truncate text-body-sm text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <Select value={u.role} onValueChange={(r) => setRole(u, r)}>
                    <SelectTrigger className="h-9" aria-label={`Role for ${label}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="min-w-0">
                    {["company", "staff"].includes(u.role) ? (
                      <Select value={u.company_id || "none"} onValueChange={(c) => setCompany(u, c)}>
                        <SelectTrigger className="h-9" aria-label={`Company access for ${label}`}><SelectValue placeholder="Approve company access" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No approved company</SelectItem>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-body-sm text-muted-foreground">{companyName(u.company_id) || "Not needed"}</span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {u.id !== currentUser?.id && (
                      <Button variant="ghost" size="icon" onClick={() => removeUser(u)} aria-label={`Remove ${label}`} title="Remove user" className="text-danger hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
