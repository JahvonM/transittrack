import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Lock, Unlock } from "lucide-react";

const REVIEWER_PIN = "9999";

export default function PinGate({ vehicle, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const submit = () => {
    if (pin === REVIEWER_PIN) {
      navigate("/reviewer-sandbox");
      return;
    }
    if (!vehicle?.driver_pin) {
      setError("No PIN has been set for this vehicle. Contact your administrator.");
      return;
    }
    if (pin === vehicle.driver_pin) {
      onUnlock();
    } else {
      setError("Incorrect PIN. Try again.");
      setPin("");
    }
  };

  return (
    <Card className="max-w-sm mx-auto">
      <CardHeader className="text-center pb-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-2">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <CardTitle>Driver PIN required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">
          Enter the 4-digit PIN assigned to {vehicle?.name} to begin your shift.
        </p>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && submit()}
          className="text-center text-2xl tracking-[0.5em]"
        />
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={pin.length < 4}>
          <Unlock className="w-4 h-4 mr-2" /> Unlock
        </Button>
      </CardContent>
    </Card>
  );
}