import React, { useEffect, useRef, useState, useCallback } from "react";
import DriverMessageAlert from "@/components/driver/DriverMessageAlert";

export default function DriverMessages({ session, invoke }) {
  const [alert, setAlert] = useState(null);
  const seen = useRef(new Set());
  const firstLoad = useRef(true);

  const playAlertSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        const start = ctx.currentTime + i * 0.25;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.start(start); osc.stop(start + 0.4);
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const broadcasts = session?.broadcasts;
    if (!broadcasts) return;
    if (firstLoad.current) {
      broadcasts.forEach((b) => seen.current.add(b.id));
      firstLoad.current = false;
      return;
    }
    broadcasts.forEach((b) => {
      if (!seen.current.has(b.id)) {
        seen.current.add(b.id);
        playAlertSound();
        setAlert(b);
      }
    });
  }, [session?.broadcasts, playAlertSound]);

  const handleReply = async (text) => {
    await invoke("send_broadcast", { message: text });
    setAlert(null);
  };

  return <DriverMessageAlert alert={alert} onAcknowledge={() => setAlert(null)} onReply={handleReply} />;
}