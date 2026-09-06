import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function ChangePassword() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [conf, setConf] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!cur || !nw) return;
    if (nw !== conf) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (nw.length < 6) {
      toast({ title: "New password is too short (min 6 characters)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await base44.auth.changePassword({
        userId: user.id,
        currentPassword: cur,
        newPassword: nw,
      });
      toast({ title: "Password updated" });
      setCur("");
      setNw("");
      setConf("");
    } catch (e) {
      toast({
        title: "Couldn't change password",
        description: "Check your current password and try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" /> Change password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-w-sm">
        <div className="space-y-1.5">
          <Label>Current password</Label>
          <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input type="password" value={nw} onChange={(e) => setNw(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Confirm new password</Label>
          <Input type="password" value={conf} onChange={(e) => setConf(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={busy || !cur || !nw}>
          {busy ? "Saving…" : "Update password"}
        </Button>
        <p className="text-xs text-muted-foreground pt-1">
          Email addresses can't be changed on Base44 accounts. To use a different email, create a new account.
        </p>
      </CardContent>
    </Card>
  );
}