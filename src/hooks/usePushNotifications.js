import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { onForegroundMessage, requestPushToken, pushPermission } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";

const currentPermission = () =>
  typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";

// What to tell people when this device can't get notifications, by reason.
export const PUSH_FAILURE = {
  native_setup: { title: "Native notifications need setup", description: "This app build needs its Firebase notification configuration. Browser notifications remain available." },
  unsupported: { title: "This browser can't show notifications", description: "On iPhone, add TransitTrack to your Home Screen and open it from there, then try again." },
  denied: { title: "Notifications are blocked", description: "Allow notifications for this site in your browser settings, then reload the page." },
  dismissed: { title: "Notifications are still off", description: "The permission prompt was closed. Tap again and choose Allow." },
  no_token: { title: "Couldn't turn on notifications", description: "The notification service didn't respond. Check your connection and try again." },
  error: { title: "Couldn't turn on notifications", description: "The notification service didn't respond. Check your connection and try again." },
  not_saved: { title: "Couldn't save this device", description: "Notifications were allowed, but this device couldn't be registered. Try again in a moment." },
  signed_out: { title: "Sign in first", description: "Notifications are linked to your account." },
};

/**
 * Push notifications for logged-in roles (staff/admin/company/mechanic).
 * Drivers have no login, so their tokens register via a driverSession action
 * instead (see DriverApp.jsx).
 *
 * The permission prompt is only ever shown from enableNotifications(), which
 * a button calls directly: browsers ignore prompts that aren't from a tap.
 * A grant from a previous visit is re-used silently. "Notifications on" is
 * only shown once this device's token is actually saved.
 */
export function usePushNotifications({ email, role, companyId } = {}) {
  const { toast } = useToast();
  const [permission, setPermission] = useState(currentPermission);
  const autoChecked = useRef(false);
  const busy = useRef(false);

  // Saves the token for the signed-in account; true only when it's stored.
  const saveToken = async (token) => {
    if (!token || !email) return false;
    try {
      const existing = await base44.entities.PushToken.filter({ token });
      if (existing.length === 0) {
        await base44.entities.PushToken.create({ token, email, role: role || "", company_id: companyId || "" });
      }
      return true;
    } catch {
      return false;
    }
  };

  // Already granted on a previous visit: re-register quietly (never prompts).
  useEffect(() => {
    if (autoChecked.current || !email) return;
    autoChecked.current = true;
    let cancelled=false;
    pushPermission().then(async p=>{
      if(cancelled)return;
      setPermission(p);
      if(p==="granted"){const {token}=await requestPushToken({prompt:false});if(token&&!cancelled)await saveToken(token);}
    });
    return()=>{cancelled=true;autoChecked.current=false;};
  }, [email, role, companyId]);

  useEffect(() => onForegroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    toast({ title: title || "Notification", description: body });
  }), [toast]);

  // For a button's onClick. Resolves true when this device will get notifications.
  const enableNotifications = async () => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const fail = (key) => { toast({ ...PUSH_FAILURE[key], variant: "destructive" }); return false; };
      if (!email) return fail("signed_out");
      const { token, reason } = await requestPushToken();
      setPermission(await pushPermission());
      if (!token) return fail(reason || "error");
      if (!(await saveToken(token))) return fail("not_saved");
      toast({ title: "Notifications on", description: "This device will get your TransitTrack alerts." });
      return true;
    } finally {
      busy.current = false;
    }
  };

  return { permission, enableNotifications };
}
