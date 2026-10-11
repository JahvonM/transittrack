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
import java.util.Map;
import org.json.JSONObject;

/**
 * Runs all the time:
 *  - screen on/off with the charger (bus ignition); never sleeps while powered
 *  - card reader and USB GPS
 *  - parked mode: 2 min after power is lost, pause GPS; keep scanning for the card reader
 *  - page refresh when the bus starts after a long park (or at 3 AM if never unplugged)
 *  - health report to the page every minute (battery, reader, GPS, last card)
 *  - driver tablets: Wi-Fi hotspot on while the bus runs and no Wi-Fi is around,
 *    off when parked (or on all the time when Admin switches "Always on")
 *  - boarding tablets: join the bus hotspot automatically; scan for / switch to
 *    another Wi-Fi network when Admin asks
 *  - driver tablets: Wi-Fi on/off, scan and join from the tablet's own Tablet
 *    settings screen; mobile data status for that screen
 *  - boarding tablets (1.12): the same from their screen, behind the bus PIN;
 *    Wi-Fi switched off there comes back on by itself after 30 minutes
 *  - boarding tablets (1.13): backup boarding over Bluetooth (BleBoarding)
 *  - 1.14: a SIM in the second slot of a two-slot tablet counts as a SIM
 */
public class HelperService extends Service {
    static final String VERSION = "1.14";
    /** "Always on" hotspot pauses below this on battery so the tablet can't run flat (it can't power itself back on). */
    private static final int HOTSPOT_MIN_BATTERY = 20;
    /** Normal hotspot: how long without Wi-Fi first (Wi-Fi can take a minute to reconnect). */
    private static final long HOTSPOT_AFTER_NO_WIFI_MS = 2 * 60 * 1000;
    /** Wi-Fi switched on / a network being chosen on the tablet's screen: the hotspot waits this long. */
    private static final long WIFI_SETUP_HOLD_MS = 3 * 60 * 1000;
    /** Boarding tablets: Wi-Fi switched off on the screen stays off this long at most (it's their only internet). */
    private static final long BOARDING_WIFI_OFF_MS = 30 * 60 * 1000;
    static volatile boolean plugged = true;
    static volatile boolean parked = false;

    private static final String CHANNEL = "helper";
    private static final long UNPLUG_DELAY_MS = 5000;              // ignore short power dips (engine crank)
    private static final long PARK_DELAY_MS = 2 * 60 * 1000;       // then pause GPS to save battery
    private static final long HEALTH_MS = 60 * 1000;
    private static final long RELOAD_AFTER_PARK_MS = 2 * 60 * 60 * 1000L;
    private static final int LOW_BATTERY = 15;
    /** Always-on tablets (ignition control off) only pause right before the battery would die. */
    private static final int CRITICAL_BATTERY = 5;

    private Handler main;
    private PowerManager.WakeLock wakeLock;
    private PowerManager.WakeLock screenWakeLock;
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

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            ensureScreenAwake();
            if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) {
                setScreen(true);
            } else {
                if (reader != null) reader.reconnect();
                new Thread(new Runnable() {
                    @Override public void run() { Kiosk.announce(HelperService.this); }
                }, "tt-reader-wake").start();
            }
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
            applyHotspot();
            ensureBle();
            if (!parked) {
                if (plugged || !Config.ignition(HelperService.this)) joinBusWifi(0);
                int battery = batteryPercent();
                int low = Config.ignition(HelperService.this) ? LOW_BATTERY : CRITICAL_BATTERY;
                if (!plugged && battery >= 0 && battery <= low) enterParked("battery low (" + battery + "%)");
            }
            ensureScreenAwake();
            pushHealth(); // Keep scanner connection status fresh while parked too.
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
        ensureStayOnWhilePowered();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TTHelper:main");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
        // Unlike a CPU-only lock, this keeps the display on while unplugged.
        screenWakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                | PowerManager.ACQUIRE_CAUSES_WAKEUP, "TTHelper:screen");
        screenWakeLock.setReferenceCounted(false);
        ensureScreenAwake();
        setScreen(true);
        IntentFilter sf = new IntentFilter();
        sf.addAction(Intent.ACTION_SCREEN_ON);
        sf.addAction(Intent.ACTION_SCREEN_OFF);
        sf.addAction(Intent.ACTION_USER_PRESENT);
        registerReceiver(screenReceiver, sf);

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
        if (!Config.ignition(this)) Status.screen = "Always on (charger or battery)";
        if (Config.hotspotAlways(this)) disableHotspotTimeout();
        main.postDelayed(new Runnable() { @Override public void run() { applyHotspot(); } }, 20000);
        if (plugged) {
            if (Config.ignition(this)) setScreen(true);
            joinBusWifi(10000);
        } else if (Config.ignition(this)) {
            main.postDelayed(screenOff, UNPLUG_DELAY_MS);
            main.postDelayed(park, PARK_DELAY_MS);
        } else {
            joinBusWifi(10000);   // always-on tablet: keep working on battery
        }

        // Local command listener: card results from the boarding page, and
        // "look for USB devices again" from any TransitTrack page.
        results = new ResultServer(new Runnable() {
            @Override public void run() { main.post(new Runnable() { @Override public void run() { rescanUsb(); } }); }
        }, commands);
        new Thread(results, "tt-results").start();
        if (Config.reader(this)) {
            reader = new CardReader(this, results);
            new Thread(reader, "tt-reader").start();
        } else {
            Status.reader = "Card reader off";
        }
        if (Config.reader(this) && !Config.hotspot(this)) {
            // Boarding tablets: backup boarding over Bluetooth.
            ble = new BleBoarding(this, new BleBoarding.Sink() {
                @Override public void code(final String text) {
                    new Thread(new Runnable() {
                        @Override public void run() { Kiosk.bleCode(HelperService.this, text); }
                    }, "tt-ble-code").start();
                }
            });
            main.postDelayed(new Runnable() { @Override public void run() { ensureBle(); } }, 12000);
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
        ensureScreenAwake();
        setScreen(true);
        plugged = isPlugged;
        Status.power = isPlugged ? "Plugged in" : "Unplugged";
        Status.log("Power " + (isPlugged ? "connected" : "disconnected"));
        main.removeCallbacks(screenOff);
        main.removeCallbacks(park);
        if (isPlugged) {
            ensureStayOnWhilePowered();
            boolean longPark = parked && System.currentTimeMillis() - parkedSince >= RELOAD_AFTER_PARK_MS;
            leaveParked();
            if (Config.ignition(this)) setScreen(true);
            if (longPark) reloadPage("bus started after a long park");
            main.postDelayed(new Runnable() { @Override public void run() { applyHotspot(); } }, 3000);
            joinBusWifi(15000);
            joinBusWifi(45000);
            main.postDelayed(new Runnable() { @Override public void run() { pushHealth(); } }, 5000);
        } else if (Config.ignition(this)) {
            main.postDelayed(screenOff, UNPLUG_DELAY_MS);
            main.postDelayed(park, PARK_DELAY_MS);
        } else {
            Status.log("Always-on tablet: keeps running on battery");
        }
    }

    private void enterParked(String why) {
        if (parked) return;
        parked = true;
        parkedSince = System.currentTimeMillis();
        Status.power = "Unplugged (parked)";
        Status.log("Parked (" + why + "): GPS paused; card reader keeps reconnecting");
        if (Config.ignition(this)) setScreen(false);
        applyHotspot();   // off when parked, unless Admin set it to always on
        pushHealth();
        // Keep the scanner thread awake, including while waiting for reconnection.
        // Tablets with the reader disabled can sleep after the GPS thread stops
        // (not with an always-on hotspot: the helper keeps checking it).
        main.postDelayed(new Runnable() {
            @Override public void run() {
                if (parked && !Config.reader(HelperService.this) && !Config.hotspotAlways(HelperService.this) && wakeLock.isHeld()) wakeLock.release();
            }
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
    private boolean hotspotPausedForBattery = false;
    /** Last time this tablet was on a working Wi-Fi network (start counts, so a fresh start waits for Wi-Fi). */
    private long lastOnWifiAt = System.currentTimeMillis();
    private String hotspotWaitLogged = "";
    private volatile long hotspotHoldUntil = 0;
    private volatile long wifiOffUntil = 0;
    private BleBoarding ble;

    /** The name phones see for Bluetooth boarding: set by the boarding page, else the bus hotspot's name. */
    private String bleName() {
        String n = Config.prefs(this).getString("ble_name", "").trim();
        if (n.isEmpty()) n = Config.joinSsid(this);
        return n;
    }

    private void ensureBle() {
        if (ble == null) return;
        new Thread(new Runnable() {
            @Override public void run() { ble.ensure(bleName()); }
        }, "tt-ble").start();
    }

    /**
     * Driver tablets: whether the hotspot should be on right now.
     *  - Always on (from Admin): on all the time, parked too; paused only below
     *    HOTSPOT_MIN_BATTERY while unplugged, back on when charging.
     *  - Normal: on while the bus runs and the tablet has had no Wi-Fi for 2
     *    minutes; off once parked. Near a working Wi-Fi network (depot, home)
     *    the tablet stays on it: starting the hotspot switches this tablet's own
     *    Wi-Fi off, and Android switches an unused hotspot off again after a few
     *    minutes, so the Wi-Fi kept dropping and coming back. Once on, the
     *    hotspot stays on (the tablet can't see Wi-Fi while it is on). No SIM:
     *    nothing to share, so no hotspot.
     */
    private void applyHotspot() {
        if (!Config.hotspot(this)) return;
        if (Config.hotspotAlways(this)) {
            int battery = batteryPercent();
            boolean low = !plugged && battery >= 0 && battery <= HOTSPOT_MIN_BATTERY;
            if (low != hotspotPausedForBattery) {
                Status.log(low ? "Hotspot paused: battery " + battery + "% (back on when charging)" : "Hotspot back on");
                hotspotPausedForBattery = low;
            }
            keepHotspot(!low);
        } else if (parked) {
            keepHotspot(false);
        } else if (!hasSim()) {
            if (Hotspot.isOn(this)) keepHotspot(false);
            else noteHotspotWait("Off (no SIM card)");
        } else if (plugged) {
            long now = System.currentTimeMillis();
            if (Hotspot.isOn(this)) {
                keepHotspot(true);
            } else if (onWifi()) {
                lastOnWifiAt = now;
                String ssid = WifiControl.currentSsid(this);
                noteHotspotWait(ssid.isEmpty() ? "Off (on Wi-Fi)" : "Off (on Wi-Fi " + ssid + ")");
            } else if (now < hotspotHoldUntil) {
                noteHotspotWait("Off (Wi-Fi being set up on the tablet)");
            } else if (now - lastOnWifiAt < HOTSPOT_AFTER_NO_WIFI_MS) {
                noteHotspotWait("Off (waiting for Wi-Fi)");
            } else {
                hotspotWaitLogged = "";
                keepHotspot(true);
            }
        }
    }

    private void noteHotspotWait(String status) {
        Status.hotspot = status;
        if (!status.equals(hotspotWaitLogged)) Status.log("Hotspot " + status.toLowerCase());
        hotspotWaitLogged = status;
    }

    private boolean onWifi() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected() && ni.getType() == android.net.ConnectivityManager.TYPE_WIFI;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Only a missing SIM counts: a SIM still starting up (or an eSIM) may share data in a moment. */
    private boolean hasSim() {
        try {
            android.telephony.TelephonyManager tm = (android.telephony.TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
            return tm == null || simState(tm) != android.telephony.TelephonyManager.SIM_STATE_ABSENT;
        } catch (RuntimeException e) {
            return true;
        }
    }

    /**
     * SIM state over every SIM slot. Two-slot tablets can hold the SIM in the
     * second slot while the default slot reads "absent". A ready SIM in any slot
     * wins; then a SIM that is present but not ready (PIN, locked, starting);
     * "absent" only when no slot has one.
     */
    static int simState(android.telephony.TelephonyManager tm) {
        final int ABSENT = android.telephony.TelephonyManager.SIM_STATE_ABSENT;
        final int UNKNOWN = android.telephony.TelephonyManager.SIM_STATE_UNKNOWN;
        final int READY = android.telephony.TelephonyManager.SIM_STATE_READY;
        int best = tm.getSimState();
        if (best == READY || Build.VERSION.SDK_INT < 26) return best;
        int slots = 1;
        try { slots = tm.getPhoneCount(); } catch (RuntimeException e) { /* one slot */ }
        for (int i = 0; i < slots; i++) {
            int s;
            try { s = tm.getSimState(i); } catch (RuntimeException e) { continue; }
            if (s == READY) return READY;
            if ((best == ABSENT || best == UNKNOWN) && s != ABSENT && s != UNKNOWN) best = s;
        }
        return best;
    }

    /** Android turns an idle hotspot off after a while; an always-on hotspot must not. */
    private void disableHotspotTimeout() {
        try {
            if (Settings.Global.getInt(getContentResolver(), "soft_ap_timeout_enabled", 1) != 0) {
                Settings.Global.putInt(getContentResolver(), "soft_ap_timeout_enabled", 0);
                Status.log("Hotspot auto-off timer switched off");
            }
        } catch (SecurityException e) {
            Status.log("Hotspot auto-off timer not changed: run  adb shell pm grant " + getPackageName() + " android.permission.WRITE_SECURE_SETTINGS");
        }
    }

    /** Admin -> Kiosk tablets switched "Always on" for this driver tablet's hotspot. */
    private void setHotspotAlways(final boolean always) {
        Config.prefs(this).edit()
                .putBoolean("hotspot_always", always)
                .putBoolean("hotspot", always || Config.hotspot(this))
                .apply();
        Status.log(always ? "Admin: keep the hotspot on all the time" : "Admin: hotspot back to normal (on while the bus runs)");
        if (always) disableHotspotTimeout();
        lastHotspotTry = 0;
        main.post(new Runnable() { @Override public void run() { applyHotspot(); } });
        main.postDelayed(new Runnable() { @Override public void run() { pushHealth(); } }, 6000);
    }

    private void holdHotspotForWifi() {
        hotspotHoldUntil = System.currentTimeMillis() + WIFI_SETUP_HOLD_MS;
    }

    /**
     * Wi-Fi switched on/off on the tablet's screen. A driver tablet can't share
     * its hotspot and use Wi-Fi at the same time, so switching Wi-Fi on stops the
     * hotspot (unless Admin keeps it always on); the hotspot then waits while a
     * network is chosen, and comes back by itself if no Wi-Fi connects.
     */
    private void setWifiPower(boolean on) {
        try {
            android.net.wifi.WifiManager w = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (!Config.hotspot(this)) {
                // Boarding tablet: Wi-Fi is its only internet, so "off" lasts 30 minutes at most.
                if (on) {
                    wifiOffUntil = 0;
                    boolean ok = w.setWifiEnabled(true);
                    Status.log(ok ? "Wi-Fi switched on from the tablet screen" : "Could not switch Wi-Fi on");
                    joinBusWifi(4000);
                } else {
                    wifiOffUntil = System.currentTimeMillis() + BOARDING_WIFI_OFF_MS;
                    boolean ok = w.setWifiEnabled(false);
                    Status.log(ok ? "Wi-Fi switched off from the tablet screen (back on by itself in 30 min)" : "Could not switch Wi-Fi off");
                }
            } else if (on) {
                if (Config.hotspotAlways(this)) {
                    Status.log("Wi-Fi not switched on: Admin keeps this tablet's hotspot always on");
                } else {
                    if (Config.hotspot(this)) {
                        holdHotspotForWifi();
                        if (Hotspot.isOn(this)) {
                            Hotspot.set(this, false);
                            try { Thread.sleep(2500); } catch (InterruptedException e) { return; }
                        }
                    }
                    boolean ok = w.setWifiEnabled(true);
                    Status.log(ok ? "Wi-Fi switched on from the tablet screen" : "Could not switch Wi-Fi on");
                }
            } else {
                hotspotHoldUntil = 0;
                boolean ok = w.setWifiEnabled(false);
                Status.log(ok ? "Wi-Fi switched off from the tablet screen" : "Could not switch Wi-Fi off");
            }
        } catch (RuntimeException e) {
            Status.log("Wi-Fi switch error: " + e.getMessage());
        }
        reportNow.run();
        main.postDelayed(new Runnable() { @Override public void run() { pushHealth(); } }, 5000);
        main.postDelayed(new Runnable() { @Override public void run() { pushHealth(); } }, 12000);
    }

    /** Mobile data for the tablet's screen: SIM, data switched on, connected, network type, operator, signal. */
    private JSONObject mobileHealth() throws org.json.JSONException {
        JSONObject m = new JSONObject();
        android.telephony.TelephonyManager tm = null;
        try { tm = (android.telephony.TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE); } catch (RuntimeException e) { /* no phone */ }
        if (tm == null) { m.put("sim", "none"); return m; }
        int sim = simState(tm);
        m.put("sim", sim == android.telephony.TelephonyManager.SIM_STATE_READY ? "ready"
                : sim == android.telephony.TelephonyManager.SIM_STATE_ABSENT ? "none" : "not ready");
        if (Build.VERSION.SDK_INT >= 26) {
            try { m.put("data", tm.isDataEnabled()); } catch (RuntimeException e) { /* not allowed on this tablet */ }
        }
        try {
            String op = tm.getNetworkOperatorName();
            if (op != null && !op.trim().isEmpty()) m.put("operator", op.trim());
        } catch (RuntimeException e) { /* ignore */ }
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                android.telephony.SignalStrength s = tm.getSignalStrength();
                if (s != null) m.put("bars", s.getLevel());
            } catch (RuntimeException e) { /* ignore */ }
        }
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo ni = cm.getNetworkInfo(android.net.ConnectivityManager.TYPE_MOBILE);
            if (ni != null) {
                m.put("connected", ni.isConnected());
                String type = ni.getSubtypeName();
                if (type != null && !type.trim().isEmpty()) m.put("type", type.trim());
            }
        } catch (RuntimeException e) { /* ignore */ }
        return m;
    }

    private final Runnable reportNow = new Runnable() {
        @Override public void run() { main.post(new Runnable() { @Override public void run() { pushHealth(); } }); }
    };

    private static String cut(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** Network commands from Admin -> Kiosk tablets, passed on by the page (see ResultServer). */
    private final ResultServer.Commands commands = new ResultServer.Commands() {
        @Override public void run(final String route, final Map<String, String> q) {
            final String id = cut(q.get("id"), 64);
            final boolean driverTablet = Config.hotspot(HelperService.this);
            if ("/hotspot".equals(route)) {
                setHotspotAlways("1".equals(q.get("always")));
                return;
            }
            if ("/health".equals(route)) {
                reportNow.run();
                return;
            }
            if ("/ble/name".equals(route)) {
                String name = BleBoarding.clip(q.get("name"));
                if (!name.equals(Config.prefs(HelperService.this).getString("ble_name", ""))) {
                    Config.prefs(HelperService.this).edit().putString("ble_name", name).apply();
                    ensureBle();
                }
                return;
            }
            if ("/wifi/power".equals(route)) {
                final boolean on = "1".equals(q.get("on"));
                new Thread(new Runnable() {
                    @Override public void run() { setWifiPower(on); }
                }, "tt-wifi-power").start();
                return;
            }
            // On a driver tablet these come from its own Tablet settings screen.
            if (driverTablet) holdHotspotForWifi();
            // From the tablet's own screen (not Admin): connect without making it the bus hotspot to stick to.
            final boolean here = driverTablet || "1".equals(q.get("here"));
            if ("/wifi/scan".equals(route)) {
                final boolean mayTurnOn = !driverTablet && System.currentTimeMillis() >= wifiOffUntil;
                new Thread(new Runnable() {
                    @Override public void run() { WifiControl.scan(HelperService.this, mayTurnOn); reportNow.run(); }
                }, "tt-wifi-scan").start();
            } else if ("/wifi/join".equals(route)) {
                final String ssid = q.get("ssid");
                final String pass = q.get("pass") == null ? "" : q.get("pass");
                if (ssid == null || ssid.trim().isEmpty() || ssid.length() > 32 || pass.length() > 63 || (!pass.isEmpty() && pass.length() < 8)) {
                    Status.log("Wi-Fi join ignored: invalid network name or password length");
                    return;
                }
                new Thread(new Runnable() {
                    @Override public void run() {
                        wifiOffUntil = 0;
                        if (here) WifiControl.joinHere(HelperService.this, id, ssid, pass, reportNow);
                        else WifiControl.join(HelperService.this, id, ssid, pass, reportNow);
                    }
                }, "tt-wifi-join").start();
            }
        }
    };

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
                if (System.currentTimeMillis() < wifiOffUntil) return;   // switched off on the screen for now
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

    /** The page's GPS / card reader status was tapped: look for the USB devices now and report back. */
    private void rescanUsb() {
        Status.log("Screen asked to look for USB devices again");
        if (reader != null) reader.reconnect();
        if (gps != null) gps.rescan();
        main.postDelayed(new Runnable() { @Override public void run() { pushHealth(); } }, 4000);
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
            if (ble != null) h.put("ble", BleBoarding.status);
            if (Config.hotspot(this)) {
                h.put("hotspot", Status.hotspot);
                h.put("hotspot_always", Config.hotspotAlways(this));
                h.put("mobile", mobileHealth());
            }
            {
                // The Wi-Fi the tablet is on and the latest scan / join: for Admin
                // (boarding tablets) and the driver tablet's own Tablet settings.
                JSONObject w = new JSONObject();
                try {
                    android.net.wifi.WifiManager wm = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    w.put("enabled", wm.isWifiEnabled());
                } catch (RuntimeException e) { /* ignore */ }
                if (System.currentTimeMillis() < wifiOffUntil) w.put("off_until", Status.iso(wifiOffUntil));
                String ssid = WifiControl.currentSsid(this);
                w.put("ssid", ssid);
                if (!ssid.isEmpty()) w.put("bars", WifiControl.currentBars(this));
                if (WifiControl.networks != null) {
                    w.put("networks", WifiControl.networks);
                    w.put("scanned_at", Status.iso(WifiControl.scannedAt));
                }
                if (!WifiControl.joinState.isEmpty()) {
                    JSONObject j = new JSONObject();
                    j.put("id", WifiControl.joinId);
                    j.put("ssid", WifiControl.joinSsid);
                    j.put("state", WifiControl.joinState);
                    j.put("message", WifiControl.joinMessage);
                    j.put("at", Status.iso(WifiControl.joinAt));
                    w.put("join", j);
                }
                h.put("wifi", w);
            }
            // The page key for network commands goes beside the report, not in it (reports go to the server).
            js = "window.__ttHelperKey=" + Kiosk.quote(ResultServer.KEY)
                    + ";window.__ttHelperHealth=Object.assign(" + h.toString() + ",{at:Date.now()})";
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

    private void ensureScreenAwake() {
        if (screenWakeLock != null && !screenWakeLock.isHeld()) screenWakeLock.acquire();
        try {
            if (Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_OFF_TIMEOUT, 0) != Integer.MAX_VALUE)
                Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_OFF_TIMEOUT, Integer.MAX_VALUE);
        } catch (SecurityException e) {
            Status.log("Screen timeout setting unavailable; screen wake lock remains active");
        }
    }

    /** Android setting: the screen never times out while the tablet is charging (AC, USB or wireless). */
    private void ensureStayOnWhilePowered() {
        try {
            int all = BatteryManager.BATTERY_PLUGGED_AC | BatteryManager.BATTERY_PLUGGED_USB | BatteryManager.BATTERY_PLUGGED_WIRELESS;
            int current = Settings.Global.getInt(getContentResolver(), Settings.Global.STAY_ON_WHILE_PLUGGED_IN, 0);
            if (current != all) {
                Settings.Global.putInt(getContentResolver(), Settings.Global.STAY_ON_WHILE_PLUGGED_IN, all);
                Status.log("Screen set to stay on while powered");
            }
        } catch (SecurityException e) {
            Status.log("Stay-on not set: run  adb shell pm grant " + getPackageName() + " android.permission.WRITE_SECURE_SETTINGS");
        }
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
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) { }
        try { unregisterReceiver(permissionReceiver); } catch (Exception ignored) { }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (screenWakeLock != null && screenWakeLock.isHeld()) screenWakeLock.release();
        Status.log("Helper stopped");
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
