package com.transittrack.app;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.util.ArrayDeque;
import java.util.List;

/** Optional, user-enabled successor to the helper's USB auto-OK service.
 * No gestures, remote commands, recording, networking or general permission approval.
 */
public class UsbAutoAcceptService extends AccessibilityService {
    static final String PREFS = "transittrack_usb_gps";
    static final String PENDING_AT = "usb_permission_requested_at";
    static final String DEVICE_LABEL = "usb_permission_device";
    private long lastClick;

    static boolean isEnabled(Context context) {
        String services = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (services == null) return false;
        ComponentName expected = new ComponentName(context, UsbAutoAcceptService.class);
        for (String service : services.split(":")) if (expected.equals(ComponentName.unflattenFromString(service))) return true;
        return false;
    }

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        long now = SystemClock.elapsedRealtime();
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (now - lastClick < 1500 || !p.getBoolean("enabled", false) ||
            p.getLong(PENDING_AT, 0) <= 0 || now - p.getLong(PENDING_AT, 0) > 45000) return;
        if (tryConfirm(getRootInActiveWindow(), p, now)) return;
        List<AccessibilityWindowInfo> windows = getWindows();
        if (windows != null) for (AccessibilityWindowInfo window : windows) {
            if (tryConfirm(window.getRoot(), p, now)) return;
        }
    }

    private boolean tryConfirm(AccessibilityNodeInfo root, SharedPreferences p, long now) {
        if (root == null || root.getPackageName() == null ||
            !"com.android.systemui".contentEquals(root.getPackageName())) return false;
        StringBuilder text = new StringBuilder();
        ArrayDeque<AccessibilityNodeInfo> nodes = new ArrayDeque<>();
        nodes.add(root);
        int count = 0;
        while (!nodes.isEmpty() && count++ < 150) {
            AccessibilityNodeInfo node = nodes.removeFirst();
            if (node.getText() != null) text.append(node.getText()).append(' ');
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) nodes.addLast(child);
            }
        }
        String app = getApplicationInfo().loadLabel(getPackageManager()).toString();
        if (!UsbPromptPolicy.eligible(root.getPackageName().toString(), text.toString(), app,
                p.getString(DEVICE_LABEL, ""), p.getBoolean("enabled", false),
                p.getLong(PENDING_AT, 0), now)) return false;
        for (String id : new String[] { "com.android.systemui:id/alwaysUse", "android:id/alwaysUse", "android:id/checkbox" }) {
            List<AccessibilityNodeInfo> boxes = root.findAccessibilityNodeInfosByViewId(id);
            if (boxes != null) for (AccessibilityNodeInfo box : boxes) {
                if (box.isCheckable() && !box.isChecked()) box.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            }
        }
        List<AccessibilityNodeInfo> buttons = root.findAccessibilityNodeInfosByViewId("android:id/button1");
        if (buttons != null) for (AccessibilityNodeInfo button : buttons) {
            if (button.isEnabled() && button.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                lastClick = now;
                p.edit().remove(PENDING_AT).remove(DEVICE_LABEL).apply();
                return true;
            }
        }
        return false;
    }

    @Override public void onInterrupt() { }
}
