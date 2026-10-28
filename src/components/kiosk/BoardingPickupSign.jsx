import React, { useCallback, useState } from "react";
import NameSign from "@/components/driver/NameSign";

// The name sign the driver sends from the driver tablet ("Name sign"). It
// arrives with the tablet's check-in and shows until it is closed or expires;
// once closed it stays closed, also after a restart.
export function usePickupSign(device, enabled = true) {
  const sign = device?.pickup_sign;
  const storageKey = "tt-dismissed-sign:" + (device?.device_id || device?.id || "");
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(storageKey); } catch { return null; } });
  const signId = sign?.id;
  const dismiss = useCallback(() => {
    if (!signId) return;
    setDismissed(signId);
    try { localStorage.setItem(storageKey, signId); } catch { /* close for this session */ }
  }, [signId, storageKey]);
  const showing = enabled && !!signId && signId !== dismissed && Date.parse(sign.expires_at) > Date.now();
  return [showing ? sign : null, dismiss];
}

export default function BoardingPickupSign({ device, enabled = true }) {
  const [sign, dismiss] = usePickupSign(device, enabled);
  if (!sign) return null;
  return <NameSign sign={sign} company={{ name: device.company_name, logo_url: device.company_logo_url }} onClose={dismiss} />;
}
