package com.transittrack.app;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.Arrays;

/**
 * Android's "Allow McSween Kiosk to access this USB device?" popup is a SystemUI screen. A
 * locked kiosk (lock task mode) only lets allowlisted apps open screens, so the popup never
 * appeared: a USB GPS (or card reader) that was already plugged in when the tablet or app
 * restarted waited for access until someone unplugged it and plugged it back in.
 *
 * While one of our own USB access requests waits for its answer, SystemUI is allowed in lock
 * task for at most WINDOW_MS, then removed again. Navigation, Home and notifications stay
 * hidden (those are lock task features, not packages). Only the device owner, only while
 * locked, and only a package we added is ever removed. KioskMode.configure() also resets the
 * allowlist whenever the kiosk screen comes back.
 */
final class UsbPromptWindow {
    static final String SYSTEM_UI = "com.android.systemui";
    static final long WINDOW_MS = 45000;
    private static final String PREFS = "tt_usb_prompt_window";
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static Runnable pendingClose;

    private UsbPromptWindow() { }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Call just before UsbManager.requestPermission. Safe to call from any thread. */
    static synchronized boolean open(Context context) {
        final Context app = context.getApplicationContext();
        if (Build.VERSION.SDK_INT < 23 || !KioskMode.owner(app) || !KioskMode.locked(app)) return false;
        try {
            DevicePolicyManager policy = KioskMode.policy(app);
            ComponentName admin = KioskMode.admin(app);
            String[] allowed = policy.getLockTaskPackages(admin);
            if (!Arrays.asList(allowed).contains(SYSTEM_UI)) {
                // Saved first, so a crash mid-window still lets close() take it away again.
                if (!prefs(app).edit().putBoolean("added", true).commit()) return false;
                String[] next = Arrays.copyOf(allowed, allowed.length + 1);
                next[allowed.length] = SYSTEM_UI;
                policy.setLockTaskPackages(admin, next);
                TabletDiagnostics.record("system", "USB_PROMPT_ALLOWED");
            }
            if (pendingClose != null) main.removeCallbacks(pendingClose);
            pendingClose = () -> close(app);
            main.postDelayed(pendingClose, WINDOW_MS);
            return true;
        } catch (RuntimeException e) {
            TabletDiagnostics.record("system", "USB_PROMPT_ALLOW_FAILED");
            return false;
        }
    }

    /** Call when the popup was answered (either way), and on time-out. */
    static synchronized void close(Context context) {
        Context app = context.getApplicationContext();
        if (pendingClose != null) { main.removeCallbacks(pendingClose); pendingClose = null; }
        SharedPreferences p = prefs(app);
        if (!p.getBoolean("added", false)) return;
        try {
            if (KioskMode.owner(app) && Build.VERSION.SDK_INT >= 23) {
                DevicePolicyManager policy = KioskMode.policy(app);
                ComponentName admin = KioskMode.admin(app);
                ArrayList<String> keep = new ArrayList<>();
                for (String name : policy.getLockTaskPackages(admin)) if (!SYSTEM_UI.equals(name)) keep.add(name);
                policy.setLockTaskPackages(admin, keep.toArray(new String[0]));
            }
            p.edit().clear().apply();
        } catch (RuntimeException e) {
            TabletDiagnostics.record("system", "USB_PROMPT_CLOSE_FAILED");
        }
    }

    /** On app start: a window left open by a crash or restart is closed. */
    static void closeIfLeftOpen(Context context) {
        if (prefs(context).getBoolean("added", false)) close(context);
    }
}
