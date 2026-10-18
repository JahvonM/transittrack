package com.transittrack.app;

/** Frame evidence only; opening two camera handles alone is never a pass. */
final class DualCameraProbeWindow {
    static final long DURATION_MS = 10_000;
    static final long FRESH_MS = 1_500;
    static boolean fresh(long last, long now) {
        return last > 0 && last <= now && now - last <= FRESH_MS;
    }
    static boolean passed(long start, long now, long frontCount, long backCount,
                          long frontLast, long backLast, boolean interrupted) {
        return !interrupted && start >= 0 && now >= start
                && now - start >= DURATION_MS && frontCount >= 30 && backCount >= 30
                && fresh(frontLast, now) && fresh(backLast, now);
    }
}
