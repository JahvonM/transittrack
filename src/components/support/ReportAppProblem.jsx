import React, { useEffect, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadSupportNumber, whatsappLink } from "@/lib/appSupport";

export function useSupportWhatsApp() {
  const [number, setNumber] = useState("");
  useEffect(() => {
    let live = true;
    loadSupportNumber().then((n) => { if (live) setNumber(n); });
    return () => { live = false; };
  }, []);
  return number;
}

// "Report an app problem" as a full-width button; hidden until an admin sets
// the support number.
export function ReportAppProblemButton({ where, className }) {
  const number = useSupportWhatsApp();
  if (!number) return null;
  return (
    <Button asChild variant="outline" size="lg" className={className}>
      <a href={whatsappLink(number, where)} target="_blank" rel="noopener noreferrer">
        <MessageSquareWarning className="h-5 w-5" aria-hidden="true" /> Report an app problem on WhatsApp
      </a>
    </Button>
  );
}
