package com.transittrack.app;

/** One in-memory tap acknowledgement. IDs never contain a card UID. */
public final class TapReceipt {
    private String id;
    private long expiresAt;
    private Boolean result;

    public synchronized void begin(String tapId, long now) {
        id = tapId; expiresAt = now + 30000; result = null;
        notifyAll();
    }
    public synchronized boolean acknowledge(String tapId, boolean accepted, long now) {
        if (id == null || !id.equals(tapId) || now >= expiresAt) return false;
        if (result != null) return result == accepted;
        result = accepted; notifyAll(); return true;
    }
    public synchronized Boolean await(String tapId, long until) {
        while (id != null && id.equals(tapId) && result == null) {
            long left = Math.min(until, expiresAt) - System.currentTimeMillis();
            if (left <= 0) break;
            try { wait(left); } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt(); return null;
            }
        }
        return id != null && id.equals(tapId) ? result : null;
    }
    public synchronized void cancel() { id = null; result = null; notifyAll(); }
}
