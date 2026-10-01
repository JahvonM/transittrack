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
import java.util.Calendar;
import org.json.JSONObject;

/**
 * Runs all the time:
 *  - screen on/off with the charger (bus ignition)
 *  - card reader and USB GPS
 *  - parked mode: 2 min after power is lost, pause reader + GPS and let the tablet sleep
 *  - page refresh when the bus starts after a long park (or at 3 AM if never unplugged)
 *  - health report to the page every minute (battery, reader, GPS, last card)
 *  - driver tablets: Wi-Fi hotspot on while the bus runs, off when parked
 *  - boarding tablets: join the bus hotspot automatically
 */
public class HelperService extends Service {
    static final String VERSION = "1.4";
    static volatile boolean plugged = true;
    static volatile boolean parked = false;

    private static final String CHANNEL = "helper";
    private static final long UNPLUG_DELAY_MS = 5000;              // ignore short power dips (engine crank)
    private static final long PARK_DELAY_MS = 2 * 60 * 1000;       // then pause everything to save battery
    private static final long HEALTH_MS = 60 * 1000;
    private static final long RELOAD_AFTER_PARK_MS = 2 * 60 * 60 * 1000L;
    private static final int LOW_BATTERY = 15;

    private Handler main;
    private PowerManager.WakeLock wakeLock;
    private ResultServer results;
    private CardReader reader;
    private UsbGps gps;
    private volatile int screenRequest = 0;
    private long parkedSince = 0;
    private int lastReloadDay = -1;

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

    private final Runnable park = new Runnable() {
        @Override public void run() { if (!plugged) enterParked("bus switched off"); }
    };

    private final Runnable health = new Runnable() {
        @Override public void run() {
            if (!parked) {
                if (plugged) keepHotspot(true);
                if (plugged) joinBusWifi(0);
                int battery = batteryPercent();
                if (!plugged && battery >= 0 && battery <= LOW_BATTERY) enterParked("battery low (" + battery + "%)");
                pushHealth();
            }
            main.postDelayed(this, HEALTH_MS);
        }
    };

    private final Runnable nightly = new Runnable() {
        @Override public void run() {
            Calendar c = Calendar.getInstance();
            int day = c.get(Calendar.DAY_OF_YEAR);
            if (plugged && !parked && c.get(Calendar.HOUR_OF_DAY) == 3 && day != lastReloadDay) {
                lastReloadDay = day;
                reloadPage("nightly refresh");
            }
            main.postDelayed(this, 10 * 60 * 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        main = new Handler(Looper.getMainLooper());
        startForeground(1, notification());
        ensureAutoOk();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TTHelper:main");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();

        IntentFilter pf = new IntentFilter();
        pf.addAction(Intent.ACTION_POWER_CONNECTED);
        pf.addAction(Intent.ACTION_POWER_DISCONNECTED);
        registerReceiver(powerReceiver, pf);
        registerReceiver(permissionReceiver, new IntentFilter(CardReader.ACTION_PERMISSION));

        Intent battery = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        plugged = battery == null || battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        parked = false;
        Status.power = plugged ? "Plugged in" : "Unplugged";
        Status.log("Helper " + VERSION + " started (" + Status.power + ")");
        if (!Config.ignition(this)) Status.screen = "Ignition control off";
        if (plugged) {
            if (Config.ignition(this)) setScreen(true);
            main.postDelayed(new Runnable() { @Override public void run() { keepHotspot(true); } }, 20000);
            joinBusWifi(10000);
        } else {
            if (Config.ignition(this)) main.postDelayed(screenOff, UNPLUG_DELAY_MS);
            main.postDelayed(park, PARK_DELAY_MS);
        }

        if (Config.reader(this)) {
            results = new ResultServer();
            new Thread(results, "tt-results").start();
            reader = new CardReader(this, results);
            new Thread(reader, "tt-reader").start();
        } else {
            Status.reader = "Card reader off";
        }
        if (Config.gps(this)) {
            gps = new UsbGps(this);
            new Thread(gps, "tt-gps").start();
        } else {
            Status.gps = "GPS off";
        }
        main.postDelayed(health, 15000);
        main.postDelayed(nightly, 10 * 60 * 1000);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    private void onPower(boolean isPlugged) {
        plugged = isPlugged;
        Status.power = isPlugged ? "Plugged in" : "Unplugged";
        Status.log("Power " + (isPlugged ? "connected" : "disconnected"));
        main.removeCallbacks(screenOff);
        main.removeCallbacks(park);
        if (isPlugged) {
            boolean longPark = parked && System.currentTimeMillis() - parkedSince >= RELOAD_AFTER_PARK_MS;
            leaveParked();
            if (Config.ignition(this)) setScreen(true);
            if (longPark) reloadPage("bus started after a long park");
            main.postDelayed(new Runnable() { @Override public void run() { keepHotspot(true); } }, 3000);
            joinBusWifi(15000);
            joinBusWifi(45000);
            main.postDelayed(new Runnable() { @Override public void run() { pushHealth(); } }, 5000);
        } else {
            if (Config.ignition(this)) main.postDelayed(screenOff, UNPLUG_DELAY_MS);
            main.postDelayed(park, PARK_DELAY_MS);
        }
    }

    private void enterParked(String why) {
        if (parked) return;
        parked = true;
        parkedSince = System.currentTimeMillis();
        Status.power = "Unplugged (parked)";
        Status.log("Parked (" + why + "): card reader and GPS paused to save battery");
        if (Config.ignition(this)) setScreen(false);
        keepHotspot(false);
        pushHealth();
        // Give the threads a moment to stop, then let the tablet sleep.
        main.postDelayed(new Runnable() {
            @Override public void run() { if (parked && wakeLock.isHeld()) wakeLock.release(); }
        }, 15000);
    }

    private void leaveParked() {
        if (!wakeLock.isHeld()) wakeLock.acquire();
        if (!parked) return;
        parked = false;
        Status.log("Power back: card reader and GPS resumed");
    }

    private void reloadPage(final String why) {
        new Thread(new Runnable() {
            @Override public void run() {
                try { Thread.sleep(8000); } catch (InterruptedException e) { return; }
                for (int attempt = 0; attempt < 6; attempt++) {
                    if (Kiosk.reload(HelperService.this)) { Status.log("Page refreshed (" + why + ")"); return; }
                    try { Thread.sleep(10000); } catch (InterruptedException e) { return; }
                }
            }
        }, "tt-reload").start();
    }

    private long lastHotspotTry = 0;
    private String lastHotspotResult = "";

    /** Driver tablets: hotspot on while the bus runs (re-checked every minute), off when parked. */
    private void keepHotspot(final boolean on) {
        if (!Config.hotspot(this)) return;
        new Thread(new Runnable() {
            @Override public void run() {
                boolean isOn = Hotspot.isOn(HelperService.this);
                if (isOn == on) { Status.hotspot = on ? "On" : "Off"; return; }
                long now = System.currentTimeMillis();
                if (on && now - lastHotspotTry < 50000) return;
                lastHotspotTry = now;
                String r = Hotspot.set(HelperService.this, on);
                if (!r.equals("requested")) {
                    Status.hotspot = "Blocked";
                    if (!r.equals(lastHotspotResult)) Status.log("Hotspot could not be turned " + (on ? "on" : "off") + ": " + r);
                } else if (!r.equals(lastHotspotResult)) {
                    Status.log("Hotspot " + (on ? "start" : "stop") + " requested");
                }
                lastHotspotResult = r;
            }
        }, "tt-hotspot").start();
    }

    /** Boarding tablets: make sure the bus hotspot is saved and joined (after a delay, off the main thread). */
    private void joinBusWifi(long delayMs) {
        if (Config.joinSsid(this).isEmpty()) return;
        main.postDelayed(new Runnable() {
            @Override public void run() {
                new Thread(new Runnable() {
                    @Override public void run() { WifiJoin.ensure(HelperService.this); }
                }, "tt-wifi").start();
            }
        }, delayMs);
    }

    private int batteryPercent() {
        Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b == null) return -1;
        int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        return level < 0 || scale <= 0 ? -1 : Math.round(level * 100f / scale);
    }

    /** Puts the helper's status into the page; its heartbeat passes it on to Admin -> Kiosk Tablets. */
    private void pushHealth() {
        final String js;
        try {
            JSONObject h = new JSONObject();
            h.put("version", VERSION);
            int battery = batteryPercent();
            if (battery >= 0) h.put("battery", battery);
            h.put("charging", plugged);
            h.put("parked", parked);
            if (Config.reader(this) && Config.seen(this, "reader")) h.put("reader", Status.reader);
            if (Status.lastCardIso != null) h.put("last_card_at", Status.lastCardIso);
            if (Config.gps(this) && Config.seen(this, "gps")) h.put("gps", Status.gps);
            if (Config.hotspot(this)) h.put("hotspot", Status.hotspot);
            js = "window.__ttHelperHealth=Object.assign(" + h.toString() + ",{at:Date.now()})";
        } catch (Exception e) {
            return;
        }
        new Thread(new Runnable() {
            @Override public void run() { Kiosk.js(HelperService.this, js); }
        }, "tt-health").start();
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
                .setContentText("Card reader, GPS and screen control running")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setOngoing(true)
                .build();
    }

    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (reader != null) reader.stop();
        if (gps != null) gps.stop();
        if (results != null) results.stop();
        try { unregisterReceiver(powerReceiver); } catch (Exception ignored) { }
        try { unregisterReceiver(permissionReceiver); } catch (Exception ignored) { }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        Status.log("Helper stopped");
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
