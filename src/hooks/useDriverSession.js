import { useEffect, useState, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { deviceMapInfo } from "@/lib/mapEngine";

export function useDriverSession(deviceId, { intervalMs = 8000 } = {}) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  // The first heartbeat also reports how this tablet draws maps.
  const sentInfoRef = useRef(false);

  const heartbeat = useCallback(async () => {
    if (!deviceId) return;
    try {
      const first = !sentInfoRef.current;
      sentInfoRef.current = true;
      const res = await base44.functions.invoke("driverSession", {
        device_id: deviceId, action: "heartbeat",
        ...(first ? { device_info: deviceMapInfo() } : {}),
      });
      setSession(res.data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Session error");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) { setLoading(false); return; }
    heartbeat();
    timerRef.current = setInterval(heartbeat, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [heartbeat, intervalMs, deviceId]);

  const invoke = useCallback(async (action, payload = {}) => {
    const res = await base44.functions.invoke("driverSession", { device_id: deviceId, action, ...payload });
    return res.data;
  }, [deviceId]);

  return { session, loading, error, refresh: heartbeat, invoke };
}