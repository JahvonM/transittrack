package com.transittrack.app;

import android.app.*;
import android.app.admin.DevicePolicyManager;
import android.content.*;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import com.getcapacitor.JSObject;
import org.json.JSONArray;

/** Native managed-kiosk policy. No WebView API can enable it or grant maintenance. */
final class KioskMode {
    static final String STORE = "tt_managed_kiosk";
    static final long MAINTENANCE_MS = 600000;
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences(STORE, Context.MODE_PRIVATE); }
    static DevicePolicyManager policy(Context c) { return (DevicePolicyManager)c.getSystemService(Context.DEVICE_POLICY_SERVICE); }
    static ComponentName admin(Context c) { return new ComponentName(c, TransitDeviceAdminReceiver.class); }
    static boolean owner(Context c) { DevicePolicyManager p = policy(c); return p != null && p.isDeviceOwnerApp(c.getPackageName()); }
    static boolean enabled(Context c) { return prefs(c).getBoolean("enabled", false); }
    static int boot(Context c) { return Settings.Global.getInt(c.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
    static boolean window(Context c, String key) {
        android.content.SharedPreferences p = prefs(c);
        return p.getInt(key + "_boot", -2) == boot(c) && SystemClock.elapsedRealtime() < p.getLong(key + "_elapsed", 0)
            && System.currentTimeMillis() < p.getLong(key + "_wall", 0);
    }
    static boolean saveWindow(Context c, String key, long ms) {
        return prefs(c).edit().putInt(key + "_boot", boot(c)).putLong(key + "_elapsed", SystemClock.elapsedRealtime() + ms)
            .putLong(key + "_wall", System.currentTimeMillis() + ms).commit();
    }
    static boolean maintenance(Context c) { return enabled(c) && window(c, "maintenance"); }
    static boolean locked(Context c) {
        ActivityManager a = (ActivityManager)c.getSystemService(Context.ACTIVITY_SERVICE);
        return a != null && Build.VERSION.SDK_INT >= 23 && a.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_LOCKED;
    }
    static void immersive(Activity a) {
        boolean hide = (enabled(a) && !maintenance(a)) || a.getSharedPreferences("tablet_display", Context.MODE_PRIVATE).getBoolean("fullscreen", false);
        if (!hide) return;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController ctl = a.getWindow().getInsetsController();
            if (ctl != null) { ctl.hide(WindowInsets.Type.systemBars()); ctl.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else a.getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
    static void configure(Context c) {
        DevicePolicyManager d = policy(c);
        d.setLockTaskPackages(admin(c), new String[]{c.getPackageName()});
        d.addUserRestriction(admin(c), UserManager.DISALLOW_CREATE_WINDOWS);
        // Hide Home/Overview/notifications. Preserve the power menu for physical recovery.
        if (Build.VERSION.SDK_INT >= 28) {
            KeyguardManager keyguard = (KeyguardManager)c.getSystemService(Context.KEYGUARD_SERVICE);
            int features = DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS;
            if (keyguard != null && keyguard.isDeviceSecure()) features |= DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD;
            d.setLockTaskFeatures(admin(c), features);
        }
        IntentFilter home = new IntentFilter(Intent.ACTION_MAIN); home.addCategory(Intent.CATEGORY_HOME); home.addCategory(Intent.CATEGORY_DEFAULT);
        d.addPersistentPreferredActivity(admin(c), home, new ComponentName(c, MainActivity.class));
    }
    static void resume(Activity a) {
        if (enabled(a) && owner(a) && !maintenance(a)) {
            try {
                configure(a);
                KeyguardManager keyguard = (KeyguardManager)a.getSystemService(Context.KEYGUARD_SERVICE);
                if (a.hasWindowFocus() && !locked(a) && (keyguard == null || !keyguard.isKeyguardLocked())) a.startLockTask();
            }
            catch (RuntimeException e) { prefs(a).edit().putString("last_error", "LOCK_RESTORE_FAILED").apply(); }
        }
        immersive(a);
        if (enabled(a)) KioskWatchdogService.start(a);
    }
    static String enable(Activity a) {
        if (Build.VERSION.SDK_INT < 26) return "UNSUPPORTED";
        if (!owner(a)) return "DEVICE_OWNER_REQUIRED";
        if (!KioskRecoveryPin.configured(a)) return "KIOSK_RECOVERY_REQUIRED";
        if (!enabled(a) && (locked(a) || TabletLockRecovery.prefs(a).getBoolean("lease", false))) return "ALREADY_LOCKED";
        reconcile(a);
        if (prefs(a).getBoolean("restore_pending", false)) return "ANDROID_ERROR";
        if (!enabled(a)) {
            JSONArray previous = new JSONArray(); for (String name : policy(a).getLockTaskPackages(admin(a))) previous.put(name);
            int features = Build.VERSION.SDK_INT >= 28 ? policy(a).getLockTaskFeatures(admin(a)) : 0;
            if (!prefs(a).edit().putString("previous_packages", previous.toString()).putInt("previous_features", features)
                .putBoolean("previous_window_restriction", policy(a).getUserRestrictions(admin(a)).getBoolean(UserManager.DISALLOW_CREATE_WINDOWS))
                .putBoolean("enabled", true).remove("maintenance_elapsed").remove("maintenance_wall").commit()) return "STORAGE_ERROR";
        } else if (!prefs(a).edit().remove("maintenance_elapsed").remove("maintenance_wall").commit()) return "STORAGE_ERROR";
        try {
            configure(a); a.startLockTask();
            if (!locked(a)) throw new IllegalStateException();
            immersive(a); KioskWatchdogService.start(a);
            return "KIOSK_ENABLED";
        } catch (RuntimeException e) { disable(a); return "ANDROID_ERROR"; }
    }
    private static void restore(Context c) throws Exception {
        DevicePolicyManager d = policy(c);
        JSONArray previous = new JSONArray(prefs(c).getString("previous_packages", "[]"));
        String[] names = new String[previous.length()]; for (int i = 0; i < names.length; i++) names[i] = previous.getString(i);
        // Removing this package ends its running task even if it was allowlisted before setup.
        // Re-adding an earlier allowlist entry must not leave maintenance pinned.
        java.util.ArrayList<String> release = new java.util.ArrayList<>();
        for (String name : names) if (!name.equals(c.getPackageName())) release.add(name);
        d.setLockTaskPackages(admin(c), release.toArray(new String[0]));
        d.setLockTaskPackages(admin(c), names);
        if (Build.VERSION.SDK_INT >= 28) d.setLockTaskFeatures(admin(c), prefs(c).getInt("previous_features", DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS));
        d.clearPackagePersistentPreferredActivities(admin(c), c.getPackageName());
        if (!prefs(c).getBoolean("previous_window_restriction", false)) d.clearUserRestriction(admin(c), UserManager.DISALLOW_CREATE_WINDOWS);
    }
    static String disable(Context c) {
        if (!owner(c)) return "DEVICE_OWNER_REQUIRED";
        if (!enabled(c) && !prefs(c).getBoolean("restore_pending", false)) return "KIOSK_DISABLED";
        // Persist first so watchdog/lifecycle cannot re-lock during restoration. Retry restore on failure.
        if (!prefs(c).edit().putBoolean("enabled", false).putBoolean("restore_pending", true).commit()) return "STORAGE_ERROR";
        try {
            restore(c); prefs(c).edit().putBoolean("restore_pending", false).commit();
            c.stopService(new Intent(c, KioskWatchdogService.class)); return "KIOSK_DISABLED";
        } catch (Exception e) { return "ANDROID_ERROR"; }
    }
    static void reconcile(Context c) {
        if (!enabled(c) && owner(c) && prefs(c).getBoolean("restore_pending", false)) {
            try { restore(c); prefs(c).edit().putBoolean("restore_pending", false).commit(); } catch (Exception ignored) { }
        }
    }
    static String prepare(Activity a) {
        if (Build.VERSION.SDK_INT < 26) return "UNSUPPORTED";
        if (!saveWindow(a, "enrollment", 120000)) return "STORAGE_ERROR";
        a.startActivity(new Intent(a, KioskMaintenanceActivity.class)); return "KIOSK_SETUP_OPENED";
    }
    static String maintain(Context c) {
        if (!enabled(c)) return "KIOSK_DISABLED";
        if (!saveWindow(c, "maintenance", MAINTENANCE_MS)) return "STORAGE_ERROR";
        try { restore(c); return "KIOSK_MAINTENANCE"; }
        catch (Exception e) { prefs(c).edit().remove("maintenance_elapsed").commit(); return "ANDROID_ERROR"; }
    }
    static void endMaintenance(Activity a) {
        prefs(a).edit().remove("maintenance_elapsed").remove("enrollment_elapsed").commit();
        a.startActivity(new Intent(a, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)); a.finish();
    }
    static JSObject state(Context c) {
        reconcile(c);
        return new JSObject().put("kioskAvailable", Build.VERSION.SDK_INT >= 26).put("kioskEnabled", enabled(c))
            .put("kioskRecoveryReady", KioskRecoveryPin.configured(c)).put("kioskMaintenance", maintenance(c))
            .put("kioskStartup", enabled(c) && owner(c)).put("kioskLocked", locked(c))
            .put("kioskError", prefs(c).getString("last_error", ""));
    }
}
