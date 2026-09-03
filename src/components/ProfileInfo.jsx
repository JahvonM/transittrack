import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Check, Mail, Pencil, Phone } from "lucide-react";

const ROLE_LABEL = {
  passenger: "Passenger",
  driver: "Driver",
  staff: "Hotel staff",
  company: "Company operator",
  admin: "Admin",
};

export default function ProfileInfo({ companyName }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState(companyName || "");

  useEffect(() => {
    setPhone(user?.phone || "");
  }, [user?.phone]);

  useEffect(() => {
    if (companyName || !user?.company_id) return;
    base44.entities.Company.get(user.company_id)
      .then((c) => setCompany(c?.name || ""))
      .catch(() => {});
  }, [companyName, user?.company_id]);

  if (!user) return null;

  const displayName = user.full_name || user.email;
  const initials = (displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2) || "·").toUpperCase();

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ phone });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 rounded-[1.25rem] border border-slate-700/50 bg-slate-800/60 backdrop-blur-[12px]">
      <div className="flex items-center gap-4">
        <span className="w-14 h-14 rounded-full bg-sky-400/15 text-sky-300 grid place-items-center text-lg font-semibold font-heading shrink-0">
          {initials}
        </span>
        <div className="min-w-0">
          <div className="font-heading font-semibold text-lg truncate">{displayName}</div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge className="bg-sky-400/15 text-sky-300 border-0 hover:bg-sky-400/25">
              {ROLE_LABEL[user.role] || user.role}
            </Badge>
            {company && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {company}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2.5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="w-4 h-4 shrink-0" />
          <span className="truncate">{user.email}</span>
        </div>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Your phone number"
              className="max-w-xs"
            />
            <Button size="sm" onClick={save} disabled={saving}>
              <Check className="w-4 h-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <Phone className="w-4 h-4 shrink-0" />
            <span>{user.phone || "Add your phone number"}</span>
            <Pencil className="w-3.5 h-3.5 ml-1 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}