package com.transittrack.app;

/** Fail-closed bounds shared by the native executor and JVM tests. */
final class TabletControlPolicy {
    static boolean id(String value) { return value != null && value.matches("[a-f0-9]{32}"); }
    static boolean token(String value) { return value != null && value.matches("[a-f0-9]{64}"); }
    static boolean action(String value) { return "lock_test".equals(value) || "release".equals(value) || "reboot".equals(value) || "app_update".equals(value) || "kiosk_prepare".equals(value) || "kiosk_enable".equals(value) || "kiosk_disable".equals(value) || "kiosk_maintenance".equals(value); }
    /** An app update may last up to 15 minutes, so the file can download over mobile data; every other command two. */
    static final long UPDATE_TTL = 900000;
    static boolean proof(String id, String expected, String action, long ttl, long lease) {
        long max = "app_update".equals(action) ? UPDATE_TTL : 120000;
        return id(id) && id.equals(expected) && action(action) && ttl > 0 && ttl <= max &&
            (!"lock_test".equals(action) || (lease > 0 && lease <= 600000));
    }
    static boolean rebootSafe(boolean safe, long safetyAt, long interactionAt, long now) {
        return safe && safetyAt > 0 && now >= safetyAt && now - safetyAt <= 10000 &&
            now >= interactionAt && now - interactionAt >= 180000;
    }
}
