import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import { Building2, Camera, Check, Loader2, Mail, Pencil, Phone } from "lucide-react";

const ROLE_LABEL = {
  passenger: "Passenger",
  driver: "Driver",
  staff: "Hotel staff",
  company: "Company operator",
  admin: "Admin",
};

export default function ProfileInfo({ companyName }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [company, setCompany] = useState(companyName || "");

  useEffect(() => {
    setFullName(user?.full_name || "");
    setPhone(user?.phone || "");
    setPhotoUrl(user?.photo_url || "");
  }, [user?.full_name, user?.phone, user?.photo_url]);

  useEffect(() => {
    if (companyName || !user?.company_id) return;
    base44.entities.Company.get(user.company_id)
      .then((c) => setCompany(c?.name || ""))
      .catch(() => {});
  }, [companyName, user?.company_id]);

  if (!user) return null;

  const displayName = fullName || user.email;
  const initials =
    (displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2) || "·").toUpperCase();

  const uploadPhoto = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ phone, photo_url: photoUrl });
      try {
        await base44.entities.User.update(user.id, { full_name: fullName });
      } catch {
        /* name update may be restricted on some plans */
      }
      setEditing(false);
      toast({ title: "Profile saved" });
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 rounded-[1.25rem] border border-slate-700/50 bg-slate-800/60 backdrop-blur-[12px]">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {photoUrl ? (
            <Image src={photoUrl} className="w-14 h-14 rounded-full" fittingType="fill" />
          ) : (
            <span className="w-14 h-14 rounded-full bg-sky-400/15 text-sky-300 grid place-items-center text-lg font-semibold font-heading">
              {initials}
            </span>
          )}
          {editing && (
            <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center cursor-pointer">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
              />
            </label>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="max-w-xs"
            />
          ) : (
            <div className="font-heading font-semibold text-lg truncate">{displayName}</div>
          )}
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
        <div className="shrink-0">
          {editing ? (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4 mr-1.5" />Edit
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2.5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="w-4 h-4 shrink-0" />
          <span className="truncate">{user.email}</span>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 shrink-0 text-muted-foreground" />
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Your phone number"
              className="max-w-xs h-8"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-4 h-4 shrink-0" />
            <span>{user.phone || "Add your phone number"}</span>
          </div>
        )}
      </div>
    </div>
  );
}