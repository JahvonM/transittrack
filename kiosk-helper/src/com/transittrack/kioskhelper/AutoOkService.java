package com.transittrack.kioskhelper;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.List;

/**
 * Android often forgets "Use by default" for a USB device that is plugged in while the tablet boots,
 * so it asks "Allow McSween Helper to access ACR122U?" again. This taps OK on that popup.
 * It only acts on System UI popups that mention this app by name: McSween Helper, or
 * TransitTrack Helper, its name before the rename (Android may still show the old name
 * until the new version is installed).
 */
public class AutoOkService extends AccessibilityService {
    private static final String[] NAMES = {"McSween Helper", "TransitTrack Helper"};
    private long lastClick = 0;

    @Override public void onServiceConnected() {
        Status.log("Auto-OK for the USB popup is active");
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (System.currentTimeMillis() - lastClick < 1500) return;
        if (tryClick(getRootInActiveWindow())) return;
        try {
            List<AccessibilityWindowInfo> windows = getWindows();
            if (windows == null) return;
            for (AccessibilityWindowInfo w : windows) {
                if (tryClick(w.getRoot())) return;
            }
        } catch (Exception ignored) { }
    }

    private boolean tryClick(AccessibilityNodeInfo root) {
        if (root == null) return false;
        CharSequence pkg = root.getPackageName();
        if (pkg == null || !"com.android.systemui".contentEquals(pkg)) return false;
        if (!mentionsUs(root)) return false;
        // Tick "Use by default / Always" if the popup offers it, then press OK.
        for (String id : new String[] {"com.android.systemui:id/alwaysUse", "android:id/alwaysUse"}) {
            List<AccessibilityNodeInfo> boxes = root.findAccessibilityNodeInfosByViewId(id);
            if (boxes != null) for (AccessibilityNodeInfo b : boxes) {
                if (b.isCheckable() && !b.isChecked()) b.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            }
        }
        List<AccessibilityNodeInfo> ok = root.findAccessibilityNodeInfosByViewId("android:id/button1");
        if (ok == null) return false;
        for (AccessibilityNodeInfo b : ok) {
            if (b.isEnabled() && b.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                lastClick = System.currentTimeMillis();
                Status.log("Tapped OK on the USB access popup");
                return true;
            }
        }
        return false;
    }

    private static boolean mentionsUs(AccessibilityNodeInfo root) {
        for (String name : NAMES) {
            List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(name);
            if (found != null && !found.isEmpty()) return true;
        }
        return false;
    }

    @Override public void onInterrupt() { }
}
