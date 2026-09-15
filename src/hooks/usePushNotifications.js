import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getFcmToken, onForegroundMessage } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";

/**
 * Registers this browser for push notifications (staff/admin/company — any
 * logged-in role) and saves the device token so backend functions can target
 * it later (proximity alerts, SOS, etc). Safe to call unconditionally; it
 * quietly no-ops if push isn't supported or permission is denied.
 *
 * Drivers don't use this — they have no login, so their tokens register via
 * a driverSession action instead (see DriverApp.jsx).
 */
export function usePushNotifications({ email, role, companyId } = {}) {
  const { toast } = useToast();
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current || !email) return;
    registered.current = true;
    getFcmToken().then(async (token) => {
      if (!token) return;
      try {
        const existing = await base44.entities.PushToken.filter({ token });
        if (existing.length === 0) {
          await base44.entities.PushToken.create({ token, email, role: role || "", company_id: companyId || "" });
        }
      } catch {
        /* best-effort — a missed registration just means no push until next visit */
      }
    });
  }, [email, role, companyId]);

  useEffect(() => {
    onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      toast({ title: title || "Notification", description: body });
    });
  }, [toast]);
}
