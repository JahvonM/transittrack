import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Phone, Siren, Stethoscope, Wrench } from "lucide-react";

export default function SafetyStandardsContent() {
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    base44.entities.Company.list().then(setCompanies);
  }, []);

  const Section = ({ icon: Icon, title, children }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle></CardHeader>
      <CardContent className="text-sm space-y-1.5 text-muted-foreground">{children}</CardContent>
    </Card>
  );

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Section icon={Siren} title="Emergency procedures">
        <p>1. Pull over safely and activate hazard lights.</p>
        <p>2. Secure passengers and check for injuries.</p>
        <p>3. Press the in-app <b>SOS</b> button to alert the fleet manager.</p>
        <p>4. Call local emergency services if anyone is hurt.</p>
        <p>5. Do not move seriously injured passengers unless there is immediate danger.</p>
      </Section>
      <Section icon={ShieldAlert} title="Breakdown protocol">
        <p>1. Stop in the safest available location.</p>
        <p>2. Place warning triangles front and rear.</p>
        <p>3. Log an incident with type <b>breakdown</b> in the driver app.</p>
        <p>4. Await dispatch instructions from the maintenance queue.</p>
      </Section>
      <Section icon={Wrench} title="Pre-trip inspection">
        <p>Complete the digital checklist before every shift: brakes, tires, lights, fluids, cleanliness.</p>
        <p>Any failed item flags the vehicle for service — do not depart until cleared.</p>
      </Section>
      <Section icon={Stethoscope} title="Passenger safety">
        <p>Count passengers boarding and alighting at every stop.</p>
        <p>Assist elderly and mobility-impaired passengers.</p>
        <p>Keep aisles and exits clear at all times.</p>
      </Section>
      <Section icon={Phone} title="Emergency contacts">
        {companies.length === 0 ? <p>No operator contacts on file.</p> :
          companies.map((c) => (
            <div key={c.id} className="flex justify-between"><span>{c.name}</span><a href={`tel:${c.phone}`} className="text-primary">{c.phone || "—"}</a></div>
          ))}
      </Section>
    </div>
  );
}