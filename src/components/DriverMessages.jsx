import React, { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import DriverMessageAlert from "@/components/driver/DriverMessageAlert";

export default function DriverMessages({ vehicle }) {
  const { user } = useAuth();
  const [alert, setAlert] = useState(null);
  const seen = useRef(new Set());

  // Two-tone arrival chime via WebAudio
  const playAlertSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        const start = ctx.currentTime + i * 0.25;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    base44.entities.Broadcast.list("-created_date", 20)
      .then((items) => {
        items.forEach((b) => seen.current.add(b.id));
      })
      .catch(() => {});
    const unsub = base44.entities.Broadcast.subscribe((event) => {
      if (event.type === "delete") return;
      const rec = event.data;
      if (!rec || seen.current.has(rec.id)) return;
      // Skip the driver's own outgoing reply echoing back
      if (rec.is_reply && rec.driver_email === user.email) {
        seen.current.add(rec.id);
        return;
      }
      const targeted = rec.driver_email && rec.driver_email === user.email;
      const broadcast = !rec.driver_email && rec.type === "info";
      if (!targeted && !broadcast) return;
      seen.current.add(rec.id);
      playAlertSound();
      setAlert(rec);
    });
    return unsub;
  }, [user?.email, playAlertSound]);

  const handleReply = async (text) => {
    await base44.entities.Broadcast.create({
      type: "info",
      title: "Reply",
      message: text,
      driver_email: user.email,
      driver_name: vehicle?.driver_name || user?.full_name || "",
      vehicle_name: vehicle?.name || "",
      company_id: vehicle?.company_id || "",
      company_name: vehicle?.company_name || "",
      is_reply: true,
    });
    setAlert(null);
  };

  return (
    <DriverMessageAlert
      alert={alert}
      onAcknowledge={() => setAlert(null)}
      onReply={handleReply}
    />
  );
}