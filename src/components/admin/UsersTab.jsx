import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, FileText, Trash2, UserPlus, Users } from "lucide-react";
import { exportToCSV, exportToPDF } from "@/lib/exporters";

const USER_COLS = [
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "company_id", label: "Company ID" },
  { key: "created_date", label: "Created" },
];

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
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
            {inviting ? "Inviting…" : "Invite"}
          </Button>
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
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {u.role === "company" && (
              <Select value={u.company_id || "none"} onValueChange={(c) => setCompany(u, c)}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue placeholder="No company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No company</SelectItem>
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