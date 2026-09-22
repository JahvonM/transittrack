import React, { useCallback, useState } from "react";
import { base44 } from "@/api/base44Client";
import BadgeRegistryKiosk from "@/components/kiosk/BadgeRegistryKiosk";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";

// Same registry a paired badge_registry kiosk tablet offers — search staff,
// register an NFC tap (works from any browser session with NFC hardware,
// not just a paired kiosk), or generate a permanent access code — just
// reachable directly from the admin's own logged-in session instead of
// requiring a dedicated tablet. BadgeRegistryKiosk only ever talks through
// its `invoke` prop and never references a device_id, so it's reused as-is;
// kioskCheckIn's backend accepts this authenticated-admin + company_id path
// for the actions that don't need a specific vehicle.
export default function AdminBadgeRegistry({ companies }) {
  const [companyId, setCompanyId] = useState("");

  const invoke = useCallback(async (action, payload = {}) => {
    const res = await base44.functions.invoke("kioskCheckIn", { action, company_id: companyId, ...payload });
    return res.data;
  }, [companyId]);

  const handleAddStaff = useCallback(async (name) => {
    const company = companies.find((c) => c.id === companyId);
    const created = await base44.entities.Contact.create({
      name, type: "staff", company_id: companyId, company_name: company?.name || "",
    });
    return { id: created.id, full_name: created.name };
  }, [companyId, companies]);

  if (!companyId) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3 max-w-sm">
          <p className="font-semibold">NFC & badge registry</p>
          <p className="text-sm text-muted-foreground">Choose a company to search its staff.</p>
          <div className="space-y-1.5">
            <Label>Company</Label>
            <select
              defaultValue=""
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="" disabled>Select company…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 max-w-md">
      <Button variant="ghost" size="sm" onClick={() => setCompanyId("")}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Change company
      </Button>
      {/* key remounts BadgeRegistryKiosk's internal state cleanly on company change */}
      <BadgeRegistryKiosk key={companyId} invoke={invoke} />
    </div>
  );
}
