package com.transittrack.app;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import java.util.List;

/** Owner-only watchdog. Never starts GPS, cameras, recording, or an unconfigured kiosk. */
public class KioskWatchdogService extends Service {
    private final Handler main = new Handler(Looper.getMainLooper());
    private long lastLaunch;
    private static volatile boolean running;
    static volatile long lastVisible;
    static void start(Context c) {
        if (running || Build.VERSION.SDK_INT < 26 || !KioskMode.enabled(c) || !KioskMode.owner(c)) return;
        try { c.startForegroundService(new Intent(c, KioskWatchdogService.class)); }
        catch (RuntimeException e) { KioskMode.prefs(c).edit().putString("last_error", "WATCHDOG_START_FAILED").apply(); }
    }
    static void launch(Context c) {
        c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }
    private final Runnable check = new Runnable() { public void run() {
        if (!KioskMode.enabled(KioskWatchdogService.this) || !KioskMode.owner(KioskWatchdogService.this)) { stopSelf(); return; }
        if (KioskMode.prefs(KioskWatchdogService.this).contains("maintenance_elapsed") && !KioskMode.maintenance(KioskWatchdogService.this)) {
            try {
                KioskMode.prefs(KioskWatchdogService.this).edit().remove("maintenance_elapsed").commit();
                KioskMode.configure(KioskWatchdogService.this); launch(KioskWatchdogService.this);
            } catch (RuntimeException e) { KioskMode.prefs(KioskWatchdogService.this).edit().putString("last_error", "MAINTENANCE_RELOCK_FAILED").apply(); }
        }
        PowerManager power = (PowerManager)getSystemService(POWER_SERVICE);
        if (!KioskMode.maintenance(KioskWatchdogService.this) && power != null && power.isInteractive()) {
            ActivityManager manager = (ActivityManager)getSystemService(ACTIVITY_SERVICE);
            List<ActivityManager.RunningAppProcessInfo> processes = manager == null ? null : manager.getRunningAppProcesses();
            boolean visible = false;
            if (processes != null) for (ActivityManager.RunningAppProcessInfo p : processes)
                if (p.pid == android.os.Process.myPid() && p.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) visible = true;
            long now = SystemClock.elapsedRealtime();
            if (visible) lastVisible = now;
            // Allow native dialogs to finish; cap relaunches to one per minute.
            if (!visible && now - lastVisible > 30000 && now - lastLaunch > 60000) {
                lastLaunch = now;
                try { KioskMode.configure(KioskWatchdogService.this); launch(KioskWatchdogService.this); }
                catch (RuntimeException e) { KioskMode.prefs(KioskWatchdogService.this).edit().putString("last_error", "WATCHDOG_REOPEN_FAILED").apply(); }
            }
        }
        main.postDelayed(this, 5000);
    }};
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (!KioskMode.enabled(this) || !KioskMode.owner(this)) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager manager = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel("managed_kiosk", "Managed kiosk", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 17121, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new Notification.Builder(this, "managed_kiosk").setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle("McSween kiosk is active").setContentText("Administrator-managed tablet").setContentIntent(open).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(17121, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
        else startForeground(17121, notification);
        running = true; main.removeCallbacks(check); main.post(check); return START_STICKY;
    }
    @Override public void onTaskRemoved(Intent root) { super.onTaskRemoved(root); if (KioskMode.enabled(this) && !KioskMode.maintenance(this)) try { launch(this); } catch (RuntimeException ignored) { } }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() { running = false; main.removeCallbacksAndMessages(null); super.onDestroy(); }
}
