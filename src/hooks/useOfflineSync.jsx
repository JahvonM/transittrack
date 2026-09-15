import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const QUEUE_KEY = "offline_create_queue";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Lightweight offline resilience for the kiosk screens.
 * `safeCreate` tries an entity create immediately; if the network fails it
 * stores the payload in localStorage. On reconnect the backlog is replayed
 * silently. Exposes reactive `online` and `pendingCount` for status UI.
 */
export function useOfflineSync() {
  const draining = useRef(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(readQueue().length);

  const refreshCount = useCallback(() => setPendingCount(readQueue().length), []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      const queue = readQueue();
      if (!queue.length) return;
      const remaining = [];
      for (const item of queue) {
        try {
          await base44.entities[item.entity].create(item.data);
        } catch {
          remaining.push(item);
        }
      }
      writeQueue(remaining);
    } finally {
      // Always release the lock, even if writeQueue (or anything else above)
      // throws — previously an exception there left draining.current stuck
      // true forever, silently killing all future retries of the backlog.
      draining.current = false;
      refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      drain();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    drain();
    // Validate the network link every 15s and silently replay any backlog.
    const pollId = setInterval(() => {
      if (navigator.onLine) drain();
    }, 15000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(pollId);
    };
  }, [drain]);

  const safeCreate = useCallback(
    async (entityName, data) => {
      try {
        return await base44.entities[entityName].create(data);
      } catch {
        const queue = readQueue();
        queue.push({ entity: entityName, data, ts: Date.now() });
        writeQueue(queue);
        refreshCount();
        return { offline: true };
      }
    },
    [refreshCount]
  );

  return { safeCreate, drain, online, pendingCount };
}