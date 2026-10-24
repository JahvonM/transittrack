import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Copy, KeyRound, Loader2, Smartphone } from "lucide-react";
import { validDriverUsername, normalizeDriverUsername } from "@/lib/driverAccount";

// Account passwords are never persisted in Driver, localStorage or logs.
// The generated temporary password only appears once in this admin dialog.
export default function DriverAccountActions({ driver, onChanged }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState("");

  const action = async (name) => {
    if (busy) return;
    if (name === "provision" && !validDriverUsername(username)) {
      setError("Username must be 4–32 characters, beginning with a letter; use letters, numbers, dots, dashes or underscores.");
      return;
    }
    setBusy(true);
    setError("");
    setIssued(null);
    try {
      const { data } = await base44.functions.invoke("driverAccounts", {
        action: name, driver_id: driver.id,
        ...(name === "provision" ? { username: normalizeDriverUsername(username) } : {}),
      });
      if (!data?.ok) throw new Error("The server did not confirm the change.");
      if (data.temporary_password) {
        setIssued({ username: data.username, password: data.temporary_password });
      } else {
        toast({ title: name === "deactivate" ? "Driver account deactivated" : "Driver account updated" });
        setOpen(false);
      }
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not update driver account");
    } finally {
      setBusy(false);
    }
  };

  const close = (isOpen) => {
    if (!isOpen && busy) return;
    setOpen(isOpen);
    if (!isOpen) { setIssued(null); setUsername(""); setError(""); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Manage phone account for ${driver.full_name}`}>
        <Smartphone className="mr-2 h-4 w-4" /> {driver.auth_user_id ? "Phone account" : "Set up phone login"}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Driver phone account</DialogTitle>
            <DialogDescription>{driver.full_name} · {driver.company_name || "No company"}</DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="space-y-3">
              <p role="status" className="text-sm font-medium">Account credentials issued. Give these to the driver securely. The temporary password will not be shown again.</p>
              <div className="rounded-xl border bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="break-all font-mono font-semibold">{issued.username}</p>
                <p className="mt-3 text-xs text-muted-foreground">Temporary password</p>
                <p className="break-all font-mono font-semibold">{issued.password}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => {
                navigator.clipboard.writeText(`Username: ${issued.username}\nTemporary password: ${issued.password}`)
                  .then(() => toast({ title: "Credentials copied — share them privately" }))
                  .catch(() => toast({ title: "Copy unavailable", variant: "destructive" }));
              }}><Copy className="mr-2 h-4 w-4" /> Copy credentials</Button>
              <p className="text-xs text-muted-foreground">The driver must set their own password on first sign-in. Avoid sharing credentials in public chats.</p>
              <Button className="w-full" onClick={() => close(false)}>I've saved the details</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {!driver.auth_user_id ? (
                <>
                  <p className="text-sm text-muted-foreground">Create a username for the phone app. No personal email is required.</p>
                  <div className="space-y-2">
                    <Label htmlFor={`username-${driver.id}`}>Driver username</Label>
                    <Input id={`username-${driver.id}`} value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="driver001" autoCapitalize="off" autoComplete="off" />
                  </div>
                  {!driver.company_id && <p className="text-sm text-destructive">Assign a company to this driver first.</p>}
                  <Button className="w-full" onClick={() => action("provision")}
                    disabled={busy || !driver.company_id || !validDriverUsername(username)}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} <KeyRound className="mr-2 h-4 w-4" /> Create phone login
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm">Username: <strong className="font-mono">{driver.username || "Not set"}</strong></p>
                  <p className="text-sm text-muted-foreground">
                    {driver.phone_app_access
                      ? driver.must_change_password ? "Active · Temporary password change required" : "Active"
                      : "Deactivated"}
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => action("reset")} disabled={busy || !driver.phone_app_access}>
                    <KeyRound className="mr-2 h-4 w-4" /> Reset password
                  </Button>
                  {driver.phone_app_access
                    ? <Button variant="destructive" className="w-full" onClick={() => action("deactivate")} disabled={busy}>Deactivate account</Button>
                    : <Button className="w-full" onClick={() => action("reactivate")} disabled={busy || !driver.company_id}>Reactivate account</Button>}
                </>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
