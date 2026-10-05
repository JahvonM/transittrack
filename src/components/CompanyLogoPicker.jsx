import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import CompanyBanner from "@/components/CompanyBanner";
import { Button } from "@/components/ui/button";

export default function CompanyLogoPicker({ name, value, onChange, onBusyChange, disabled }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a PNG, JPG or WebP logo under 5 MB."); return;
    }
    setError(""); setUploading(true); onBusyChange?.(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      if (!result.file_url) throw new Error("Upload did not return a logo.");
      onChange(result.file_url);
    } catch { setError("Couldn't upload the logo. Try again."); }
    finally { setUploading(false); onBusyChange?.(false); }
  };
  return <div className="space-y-2">
    <label className="block text-sm font-medium">Company logo
      <input aria-label="Company logo" className="mt-1 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={disabled || uploading} />
    </label>
    {uploading && <p role="status" className="text-xs text-muted-foreground">Uploading logo…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <CompanyBanner name={name || "Your company"} logoUrl={value} label="Company banner preview" />
    <p className="text-xs text-muted-foreground">Your logo and company name automatically become the banner on passenger and tablet screens.</p>
    {value && <Button type="button" size="sm" variant="ghost" disabled={uploading || disabled} onClick={() => onChange("")}>Remove logo</Button>}
  </div>;
}
