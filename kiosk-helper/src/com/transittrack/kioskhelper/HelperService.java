package com.transittrack.kioskhelper;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;

/** Runs all the time: screen on/off with the charger, and the card reader. */
public class HelperService extends Service {
    static volatile boolean plugged = true;
    private static final String CHANNEL = "helper";
    private static final long UNPLUG_DELAY_MS = 5000;  // ignore short power dips (engine crank)

    private Handler main;
    private PowerManager.WakeLock wakeLock;
    private ResultServer results;
    private CardReader reader;
    private volatile int screenRequest = 0;

    static void start(Context c) {
        Intent i = new Intent(c, HelperService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    private final BroadcastReceiver powerReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            onPower(Intent.ACTION_POWER_CONNECTED.equals(i.getAction()));
        }
    };

    private final BroadcastReceiver permissionReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            boolean granted = i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
            Status.log(granted ? "USB access granted" : "USB access denied");
        }
    };

    private final Runnable screenOff = new Runnable() {
        @Override public void run() { if (!plugged) setScreen(false); }
    };

    @Override public void onCreate() {
        super.onCreate();
        main = new Handler(Looper.getMainLooper());
        startForeground(1, notification());
        ensureAutoOk();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TTHelper:main");
        wakeLock.acquire();

        IntentFilter pf = new IntentFilter();
        pf.addAction(Intent.ACTION_POWER_CONNECTED);
        pf.addAction(Intent.ACTION_POWER_DISCONNECTED);
        registerReceiver(powerReceiver, pf);
        registerReceiver(permissionReceiver, new IntentFilter(CardReader.ACTION_PERMISSION));

        Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        plugged = battery == null || battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        Status.power = plugged ? "Plugged in" : "Unplugged";
        Status.log("Helper started (" + Status.power + ")");
        if (Config.ignition(this)) {
            if (plugged) setScreen(true); else main.postDelayed(screenOff, UNPLUG_DELAY_MS);
        } else {
            Status.screen = "Ignition control off";
        }

        if (Config.reader(this)) {
            results = new ResultServer();
            new Thread(results, "tt-results").start();
            reader = new CardReader(this, results);
            new Thread(reader, "tt-reader").start();
        } else {
            Status.reader = "Card reader off";
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    private void onPower(boolean isPlugged) {
        plugged = isPlugged;
        Status.power = isPlugged ? "Plugged in" : "Unplugged";
        Status.log("Power " + (isPlugged ? "connected" : "disconnected"));
        if (!Config.ignition(this)) return;
        main.removeCallbacks(screenOff);
        if (isPlugged) setScreen(true); else main.postDelayed(screenOff, UNPLUG_DELAY_MS);
    }

    /** Tells FreeKiosk to turn the screen on/off; retries for ~2 minutes (FreeKiosk may still be starting). */
    private void setScreen(final boolean on) {
        final int request = ++screenRequest;
        new Thread(new Runnable() {
            @Override public void run() {
                for (int attempt = 0; attempt < 12; attempt++) {
                    if (request != screenRequest) return;  // a newer request replaced this one
                    if (Kiosk.screen(HelperService.this, on)) {
                        Status.screen = (on ? "On" : "Off") + "  (" + Status.now() + ")";
                        Status.log("Screen " + (on ? "on" : "off"));
                        return;
                    }
                    try { Thread.sleep(10000); } catch (InterruptedException e) { return; }
                }
                Status.log("Could not set screen " + (on ? "on" : "off") + " - is FreeKiosk's REST API on?");
            }
        }, "tt-screen").start();
    }

    /** Switches on the auto-OK accessibility service, keeping any others (e.g. FreeKiosk's) switched on. */
    private void ensureAutoOk() {
        String me = getPackageName() + "/" + AutoOkService.class.getName();
        try {
            String list = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (list == null) list = "";
            boolean present = false;
            for (String part : list.split(":")) {
                if (part.equalsIgnoreCase(me) || part.equalsIgnoreCase(getPackageName() + "/.AutoOkService")) present = true;
            }
            if (!present) {
                String updated = list.isEmpty() ? me : list + ":" + me;
                Settings.Secure.putString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, updated);
                Status.log("Switched on auto-OK for the USB popup");
            }
            Settings.Secure.putInt(getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 1);
        } catch (SecurityException e) {
            Status.log("Auto-OK not switched on: run  adb shell pm grant " + getPackageName() + " android.permission.WRITE_SECURE_SETTINGS");
        }
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "TransitTrack Helper", NotificationManager.IMPORTANCE_MIN);
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        return b.setContentTitle("TransitTrack Helper")
                .setContentText("Card reader and screen control running")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setOngoing(true)
                .build();
    }

    @Override public void onDestroy() {
        if (reader != null) reader.stop();
        if (results != null) results.stop();
        try { unregisterReceiver(powerReceiver); } catch (Exception ignored) { }
        try { unregisterReceiver(permissionReceiver); } catch (Exception ignored) { }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        Status.log("Helper stopped");
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
