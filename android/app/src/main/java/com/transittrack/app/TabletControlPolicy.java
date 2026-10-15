package com.transittrack.app;

/** Fail-closed bounds shared by the native executor and JVM tests. */
final class TabletControlPolicy {
    static boolean id(String value) { return value != null && value.matches("[a-f0-9]{32}"); }
    static boolean token(String value) { return value != null && value.matches("[a-f0-9]{64}"); }
    static boolean action(String value) { return "lock_test".equals(value) || "release".equals(value) || "reboot".equals(value) || "app_update".equals(value); }
    static boolean proof(String id, String expected, String action, long ttl, long lease) {
        return id(id) && id.equals(expected) && action(action) && ttl > 0 && ttl <= 120000 &&
            (!"lock_test".equals(action) || (lease > 0 && lease <= 600000));
    }
    static boolean rebootSafe(boolean safe, long safetyAt, long interactionAt, long now) {
        return safe && safetyAt > 0 && now >= safetyAt && now - safetyAt <= 10000 &&
            now >= interactionAt && now - interactionAt >= 180000;
    }
}
