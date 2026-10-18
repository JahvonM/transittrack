package com.transittrack.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class UsbPromptPolicyTest {
    private boolean allowed(String pkg, String text, String device, boolean enabled, long at, long now) {
        return UsbPromptPolicy.eligible(pkg, text, "TransitTrack", device, enabled, at, now);
    }
    @Test public void acceptsOnlyOwnPendingReceiverPrompt() {
        assertTrue(allowed("com.android.systemui", "Allow TransitTrack to access VFAN GPS?", "VFAN GPS", true, 1000, 2000));
    }
    @Test public void rejectsOtherPackagesAppsAndDevices() {
        assertFalse(allowed("com.android.settings", "Allow TransitTrack to access VFAN GPS?", "VFAN GPS", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow Other App to access VFAN GPS?", "VFAN GPS", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack Helper to access VFAN GPS?", "VFAN GPS", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack Clone to access VFAN GPS?", "VFAN GPS", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTracker to access VFAN GPS?", "VFAN GPS", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack to access ACR122U?", "VFAN GPS", true, 1000, 2000));
    }
    @Test public void rejectsUnrelatedPermissionPrompts() {
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack camera access?", "VFAN GPS", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack to record your screen?", "", true, 1000, 2000));
    }
    @Test public void usbNameCannotApproveScreenOrCameraConsent() {
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack to access this USB screen recording?", "", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack to access VFAN GPS camera?", "VFAN GPS", true, 1000, 2000));
    }
    @Test public void requiresEnabledGpsAndUnexpiredRequest() {
        String text = "Allow TransitTrack to access VFAN GPS?";
        assertFalse(allowed("com.android.systemui", text, "VFAN GPS", false, 1000, 2000));
        assertFalse(allowed("com.android.systemui", text, "VFAN GPS", true, 0, 2000));
        assertFalse(allowed("com.android.systemui", text, "VFAN GPS", true, 1000, 47000));
        assertFalse(allowed("com.android.systemui", text, "VFAN GPS", true, 1000, 500));
    }
    @Test public void missingProductNameStillRequiresAnExplicitUsbDialog() {
        assertTrue(allowed("com.android.systemui", "Allow TransitTrack to access this USB device?", "", true, 1000, 2000));
        assertFalse(allowed("com.android.systemui", "Allow TransitTrack notifications?", "", true, 1000, 2000));
    }
}
