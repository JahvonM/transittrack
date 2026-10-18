import React, { useState } from "react";
import NameSign from "@/components/driver/NameSign";

export default function BoardingPickupSign({ device, enabled = true }) {
  const sign = device?.pickup_sign;
  const storageKey = "tt-dismissed-sign:" + (device?.device_id || device?.id || "");
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(storageKey); } catch { return null; } });
  if (!enabled || !sign?.id || sign.id === dismissed || !(Date.parse(sign.expires_at) > Date.now())) return null;
  return <NameSign sign={sign} company={{ name: device.company_name, logo_url: device.company_logo_url }}
    onClose={() => { setDismissed(sign.id); try { localStorage.setItem(storageKey,sign.id); } catch { /* close for this session */ } }} />;
}
