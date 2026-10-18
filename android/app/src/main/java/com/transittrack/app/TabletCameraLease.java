package com.transittrack.app;

/** This tablet failed concurrent capture; native camera consumers are exclusive. */
final class TabletCameraLease {
    private static String owner;
    static synchronized boolean acquire(String value) {
        if (!"support".equals(value) && !"dashcam".equals(value)) return false;
        if (owner != null) return false;
        owner = value; return true;
    }
    static synchronized void release(String value) { if (value != null && value.equals(owner)) owner = null; }
    static synchronized boolean occupied() { return owner != null; }
}
