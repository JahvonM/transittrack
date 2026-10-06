import { saveDeviceToken } from "@/lib/deviceAuth";
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DriverPairing({ onPaired }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!value) return;
    setChecking(true);
    setError("");
    try {
      const res = await base44.functions.invoke("pairKioskDevice", { pairing_code: value, expected_type: "driver" });
      if (res.data?.kiosk_type !== "driver") {
        setError("This pairing code is for a kiosk tablet, not a driver tablet.");
        setChecking(false);
        return;
      }
      if (!res.data?.vehicle_id) {
        setError("No vehicle assigned to this tablet. Contact your administrator.");
        setChecking(false);
        return;
      }
      saveDeviceToken(res.data.device_id, res.data.device_token);
      onPaired(res.data.device_id);
    } catch (err) {
      setError(err?.response?.data?.error || "Invalid or expired pairing code.");
      setChecking(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background safe-area-top safe-area-x">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center mb-2">
              <Bus className="w-6 h-6" />
            </div>
            <CardTitle className="text-xl">Pair driver tablet</CardTitle>
            <CardDescription>Enter the pairing code your administrator gave you to link this tablet to your vehicle.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. ABCD2345EFGH" maxLength={12} autoFocus className="h-12 text-center text-lg font-semibold tracking-[0.3em]" />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={checking || !code.trim()}>
                {checking ? "Pairing…" : "Pair tablet"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}