import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { getFcmToken, onForegroundMessage } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";

/**
 * Push notifications for logged-in roles (staff/admin/company). Drivers have
 * no login, so their tokens register via a driverSession action instead
 * (see DriverApp.jsx).
 *
 * Important: browsers (Chrome in particular) silently ignore a notification
 * permission request that isn't triggered by a real user gesture — no
 * prompt appears at all, it just resolves as if denied. So this hook does
 * NOT auto-request on mount. It only silently re-registers if permission was
 * already granted on a previous visit; otherwise it exposes
 * `enableNotifications()` for a button's onClick to call directly.
 */
export function usePushNotifications({ email, role, companyId } = {}) {
  const { toast } = useToast();
  const [permission, setPermission] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const autoChecked = useRef(false);

  const saveToken = async (token) => {
    if (!token || !email) return;
    try {
      const existing = await base44.entities.PushToken.filter({ token });
      if (existing.length === 0) {
        await base44.entities.PushToken.create({ token, email, role: role || "", company_id: companyId || "" });
      }
    } catch {
      /* best-effort */
    }
  };

  // Already granted from a previous visit — re-registering needs no prompt,
  // so this part is safe to do automatically.
  useEffect(() => {
    if (autoChecked.current || !email) return;
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    autoChecked.current = true;
    getFcmToken().then(saveToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, role, companyId]);

  useEffect(() => {
    onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      toast({ title: title || "Notification", description: body });
    });
  }, [toast]);

  const enableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast({ title: "Not supported", description: "This browser doesn't support push notifications.", variant: "destructive" });
      return;
    }
    if (Notification.permission === "denied") {
      toast({
        title: "Notifications are blocked",
        description: "Enable them for this site in your browser's settings, then reload the page.",
        variant: "destructive",
      });
      return;
    }
    const token = await getFcmToken();
    setPermission(Notification.permission);
    if (token) {
      await saveToken(token);
      toast({ title: "Notifications enabled" });
    } else {
      toast({ title: "Couldn't enable notifications", description: "Permission wasn't granted.", variant: "destructive" });
    }
  };

  return { permission, enableNotifications };
}
