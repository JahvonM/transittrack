import { toast } from "@/components/ui/use-toast";
import React, { useState } from "react";
import EmptyState from "@/components/EmptyState";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { PageIntro, StatusChip } from "@/components/admin/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, KeyRound, Pencil, Trash2 } from "lucide-react";
import CompanyEditDialog from "@/components/CompanyEditDialog";
import CreateCompanyForm from "@/components/admin/CreateCompanyForm";

export default function CompaniesTab({ companies, onChange }) {
  const [copied, setCopied] = useState(null);
  const [editing, setEditing] = useState(null);
  const [issuing, setIssuing] = useState(null);

  const copy = (code) => {
    navigator.clipboard.writeText(code || "");
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };
  const remove = async (id) => {
    await base44.entities.Company.delete(id);
    onChange();
  };

  return (
    <div className="space-y-4">
      <PageIntro>Bus operators and their passenger access codes.</PageIntro>
      <div className="space-y-2">
        {companies.length === 0 && (
          <div className="border rounded-2xl"><EmptyState text="No companies yet." /></div>
        )}
        {companies.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center gap-3 py-4">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-1">
                  {(c.service_types || []).map((t) => (
                    <StatusChip key={t} tone="neutral" dot={false} className="capitalize">
                      {t.replace("_", " ")}
                    </StatusChip>
                  ))}
                </div>
                {c.phone && <div className="text-xs text-muted-foreground mt-1">{c.phone}</div>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/40">
                <KeyRound className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-caption uppercase tracking-wide text-muted-foreground">Access code</div>
                  <div className="font-mono font-bold tracking-[0.2em]">{c.access_code || "—"}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(c.access_code)} aria-label={`Copy access code for ${c.name}`} title="Copy code">
                  {copied === c.access_code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button variant="outline" size="sm" disabled={issuing === c.id} onClick={async () => {
                setIssuing(c.id);
                try {
                  const res = await base44.functions.invoke("manageAccessCodes", { action: "issue_company", company_id: c.id });
                  toast({ title: "Company join code", description: res.data.code });
                  onChange();
                } catch (error) { toast({ title: "Could not issue code", description: error.message, variant: "destructive" }); }
                finally { setIssuing(null); }
              }}>Get code</Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(c)}>
                <Pencil className="w-4 h-4 mr-1.5" />Edit
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(c.id)} aria-label={`Delete ${c.name}`} title="Delete company">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <CreateCompanyForm onChange={onChange} />
      <CompanyEditDialog
        company={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={onChange}
      />
    </div>
  );
}