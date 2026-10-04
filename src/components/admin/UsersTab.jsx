import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { FileSpreadsheet, FileText, KeyRound, Trash2, UserPlus, Users } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" /> Users &amp; roles
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToCSV("users", USER_COLS, users)} disabled={!users.length}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportToPDF("users", "Users and roles", USER_COLS, users)} disabled={!users.length}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/40">
          <UserPlus className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="invite by email"
            className="flex-1 min-w-[160px] h-8"
          />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="driver">Driver</SelectItem>
              <SelectItem value="staff">Hotel staff</SelectItem>
              <SelectItem value="mechanic">Mechanic</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? "Inviting…" : "Invite"}
          </Button>
          <span className="text-xs text-muted-foreground w-full sm:w-auto">or</span>
          <CreateAccountDialog companies={companies} onCreated={onChange} />
        </div>
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border">
            <div className="flex-1 min-w-[160px]">
              <div className="font-medium text-sm">{u.full_name || u.email}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
            <Badge variant="outline">{u.role}</Badge>
            <Select value={u.role} onValueChange={(r) => setRole(u, r)}>
              <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="staff">Hotel staff</SelectItem>
                <SelectItem value="mechanic">Mechanic</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {["company", "staff"].includes(u.role) && (
              <Select value={u.company_id || "none"} onValueChange={(c) => setCompany(u, c)}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue placeholder="Approve company access" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No approved company</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {u.id !== currentUser?.id && (
              <Button variant="ghost" size="icon" onClick={() => removeUser(u)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
