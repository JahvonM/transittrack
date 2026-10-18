package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class ScreenRecoveryPolicyTest {
    @Test public void onlyTwoAutomaticRestartsInWindow() {
        long start = 1000000;
        assertTrue(ScreenRecoveryPolicy.automatic(start + 1, start, 0, true));
        assertTrue(ScreenRecoveryPolicy.automatic(start + 2, start, 1, true));
        assertFalse(ScreenRecoveryPolicy.automatic(start + 3, start, 2, true));
        assertFalse(ScreenRecoveryPolicy.automatic(start + ScreenRecoveryPolicy.WINDOW_MS, start, 2, true));
        assertTrue(ScreenRecoveryPolicy.automatic(start + ScreenRecoveryPolicy.WINDOW_MS + 1, start, 2, true));
    }
    @Test public void backgroundAndClockRollbackDoNotRestart() {
        assertFalse(ScreenRecoveryPolicy.automatic(1001, 1000, 0, false));
        assertFalse(ScreenRecoveryPolicy.automatic(999, 1000, 0, true));
        assertFalse(ScreenRecoveryPolicy.automatic(1000, 1000, -1, true));
    }
    @Test public void cleanInstallAllowsFirstForegroundRecovery() {
        assertTrue(ScreenRecoveryPolicy.automatic(1000, 0, 0, true));
        assertFalse(ScreenRecoveryPolicy.automatic(1000, 0, 0, false));
    }
}
