package com.transittrack.app;

/** Only called for a confirmed dead renderer, never a failed/slow network request. */
final class ScreenRecoveryPolicy {
    static final long WINDOW_MS = 10 * 60 * 1000;
    static boolean newWindow(long now, long start) {
        return start == 0 || (now >= start && now - start > WINDOW_MS);
    }
    static boolean automatic(long now, long start, int attempts, boolean foreground) {
        if (!foreground || now < 0 || start < 0 || attempts < 0 || now < start) return false;
        return newWindow(now, start) || attempts < 2;
    }
}
