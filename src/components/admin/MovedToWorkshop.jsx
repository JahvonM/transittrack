import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Warehouse } from "lucide-react";

// Parts and the Bus library moved into the Workshop (/workshop). Their old
// screens stay for one release, until the owner is happy nothing is missing,
// and each says at the top where things are now.
export default function MovedToWorkshop({ title, to, note = "This old view stays for now, until you're happy nothing is missing.", children }) {
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <Warehouse className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-[200px] flex-1 text-body-sm">
        <p className="font-semibold">{title}</p>
        {note && <p className="text-muted-foreground">{note}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild><Link to={to}>Open in the Workshop</Link></Button>
        {children}
      </div>
    </div>
  );
}
