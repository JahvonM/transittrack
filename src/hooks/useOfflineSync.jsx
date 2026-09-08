import { useCallback, useEffect, useRef } from "react";
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
 * stores the payload in localStorage. On reconnect (the browser "online" event)
 * the backlog is replayed silently to the central database.
 */
export function useOfflineSync() {
  const draining = useRef(false);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    const queue = readQueue();
    if (!queue.length) {
      draining.current = false;
      return;
    }
    const remaining = [];
    for (const item of queue) {
      try {
        await base44.entities[item.entity].create(item.data);
      } catch {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    draining.current = false;
  }, []);

  useEffect(() => {
    const onOnline = () => drain();
    window.addEventListener("online", onOnline);
    drain();
    return () => window.removeEventListener("online", onOnline);
  }, [drain]);

  const safeCreate = useCallback(
    async (entityName, data) => {
      try {
        return await base44.entities[entityName].create(data);
      } catch {
        const queue = readQueue();
        queue.push({ entity: entityName, data, ts: Date.now() });
        writeQueue(queue);
        return { offline: true };
      }
    },
    []
  );

  return { safeCreate, drain, pendingCount: readQueue().length };
}