package com.transittrack.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import org.json.JSONArray;
import java.util.LinkedHashSet;

/** Native offline escape for this app's bounded test lock. No WebView or server required. */
final class TabletLockRecovery {
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("tt_tablet_control", Context.MODE_PRIVATE); }
    static PendingIntent intent(Context context) {
        return PendingIntent.getBroadcast(context, 17041, new Intent(context, TabletLockExpiryReceiver.class).setAction("com.transittrack.app.LOCK_EXPIRED"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static boolean canSchedule(Context context) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT >= 23 && alarm != null && (Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms());
    }
    static void schedule(Context context, long deadline) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        alarm.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, intent(context));
    }
    static void cancel(Context context) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm != null) alarm.cancel(intent(context));
    }
    static boolean due(Context context) {
        SharedPreferences p = prefs(context); long now = SystemClock.elapsedRealtime();
        return p.getBoolean("lease", false) && (now < p.getLong("leaseStartedElapsed", 0) ||
            now >= p.getLong("leaseElapsed", 0) || System.currentTimeMillis() >= p.getLong("leaseWall", 0));
    }
    static boolean release(Context context) {
        SharedPreferences p = prefs(context);
        if (!p.getBoolean("lease", false)) return true;
        try {
            DevicePolicyManager policy = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (policy == null || !policy.isDeviceOwnerApp(context.getPackageName()) || Build.VERSION.SDK_INT < 23) return false;
            ComponentName admin = new ComponentName(context, TransitDeviceAdminReceiver.class);
            LinkedHashSet<String> allowed = new LinkedHashSet<>();
            for (String name : policy.getLockTaskPackages(admin)) if (!name.equals(context.getPackageName())) allowed.add(name);
            JSONArray previous = new JSONArray(p.getString("previousPackages", "[]"));
            for (int i = 0; i < previous.length(); i++) allowed.add(previous.getString(i));
            // Removing this package ends its lock task on Android 6+, even with no Activity/process.
            policy.setLockTaskPackages(admin, allowed.toArray(new String[0]));
            boolean saved = p.edit().putBoolean("lease", false).putString("lastCode", "LEASE_RELEASED")
                .remove("previousPackages").remove("leaseWall").remove("leaseElapsed").commit();
            if (saved) cancel(context);
            return saved;
        } catch (Exception ignored) { return false; }
    }
}
