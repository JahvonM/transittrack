import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Shield } from "lucide-react";

const POLICY =
  "This app collects and encrypts live location data, tablet hardware identifiers, and NFC logs strictly for internal corporate staff bus coordination. Location tracking only operates during active shift cycles. No data is shared with third-party networks or advertising servers.";

export default function PrivacyPolicyDialog({ trigger }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <button className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Privacy Policy
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Privacy Policy
          </DialogTitle>
          <DialogDescription>
            How we handle your data in this app.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">{POLICY}</p>
      </DialogContent>
    </Dialog>
  );
}