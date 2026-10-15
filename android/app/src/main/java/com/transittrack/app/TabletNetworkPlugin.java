package com.transittrack.app;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.*;
import android.content.pm.ApplicationInfo;
import android.location.LocationManager;
import android.net.Uri;
import android.net.wifi.*;
import android.os.*;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.*;
import java.util.concurrent.*;

@CapacitorPlugin(name = "TabletNetwork", permissions = {
    @Permission(alias = "scanLocation", strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
    @Permission(alias = "nearbyWifi", strings = { Manifest.permission.NEARBY_WIFI_DEVICES })
})
public class TabletNetworkPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final LinkedHashMap<String, JSObject> completed = new LinkedHashMap<>();
    private final TabletPowerPolicy power = new TabletPowerPolicy();
    private SharedPreferences prefs;
    private WifiManager wifi;
    private boolean enabled, always, foreground = true, destroyed, ownedHotspot, hotspotAttempt;
    private String mode = "", hotspot = "Unknown", lastCode = "", pendingType = "", pendingId = "";
    private int policyFailures;
    private PluginCall pendingCall;
    private JSArray networks = new JSArray();
    private String scannedAt = "";
    private JSObject join = new JSObject();
    private long lastScanAt;
    private Runnable deadline;
    private final Runnable watchdog = new Runnable() {
        @Override public void run() {
            if (destroyed) return;
            updatePower();
            if (enabled && always && foreground && mode.equals("driver") && !hotspotAttempt && policyFailures < 2) {
                if (power.parked()) {
                    if (ownedHotspot && Boolean.TRUE.equals(TabletHotspotApi.isOn(getContext()))) {
                        TabletHotspotApi.request(getContext(), false, ok -> {});
                        hotspot = "Paused: low battery"; publish();
                    }
                } else if (pendingCall == null && !Boolean.TRUE.equals(TabletHotspotApi.isOn(getContext()))) {
                    beginHotspot(null, "");
                }
            }
            main.postDelayed(this, 30000);
        }
    };
    private final BroadcastReceiver scanReady = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            if ("wifi_scan".equals(pendingType) && intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false))
                finishScan();
        }
    };
    @Override public void load() {
        prefs = getContext().getSharedPreferences("transittrack_network", Context.MODE_PRIVATE);
        enabled = prefs.getBoolean("enabled", false); always = prefs.getBoolean("always", false);
        ownedHotspot = always;
        wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(scanReady, filter, Context.RECEIVER_EXPORTED);
        else getContext().registerReceiver(scanReady, filter);
        main.post(watchdog);
    }
    private boolean managedWifi() {
        DevicePolicyManager dpm = (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        return Build.VERSION.SDK_INT < 29 || (dpm != null && dpm.isDeviceOwnerApp(getContext().getPackageName()))
            || (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_SYSTEM) != 0;
    }
    private boolean scanAllowed() {
        return getPermissionState("scanLocation") == PermissionState.GRANTED &&
            (Build.VERSION.SDK_INT < 33 || getPermissionState("nearbyWifi") == PermissionState.GRANTED);
    }
    private boolean locationOn() {
        try {
            LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            return Build.VERSION.SDK_INT >= 28 ? lm != null && lm.isLocationEnabled()
                : Settings.Secure.getInt(getContext().getContentResolver(), Settings.Secure.LOCATION_MODE, 0) != 0;
        } catch (RuntimeException ignored) { return false; }
    }
    private String currentSsid() {
        try {
            String s = wifi.getConnectionInfo().getSSID();
            if (s == null || s.equals("<unknown ssid>")) return "";
            return s.startsWith("\"") && s.endsWith("\"") ? s.substring(1, s.length() - 1) : s;
        } catch (RuntimeException ignored) { return ""; }
    }
    private String iso() { return java.time.Instant.ofEpochMilli(System.currentTimeMillis()).toString(); }
    JSObject state() {
        JSObject out = new JSObject(), w = new JSObject(), capabilities = new JSObject();
        out.put("available", true); out.put("enabled", enabled); out.put("at", System.currentTimeMillis());
        capabilities.put("managedWifi", managedWifi()); capabilities.put("scanPermission", scanAllowed());
        capabilities.put("locationOn", locationOn()); capabilities.put("hotspotOemPath", Build.VERSION.SDK_INT == 29);
        capabilities.put("writeSettings", Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(getContext()));
        out.put("capabilities", capabilities);
        try {
            w.put("enabled", wifi != null && wifi.isWifiEnabled()); w.put("ssid", currentSsid());
            if (wifi != null) w.put("bars", WifiManager.calculateSignalLevel(wifi.getConnectionInfo().getRssi(), 5));
        } catch (RuntimeException ignored) { }
        w.put("networks", networks); if (!scannedAt.isEmpty()) w.put("scanned_at", scannedAt);
        w.put("join", join); out.put("wifi", w);
        Boolean on = TabletHotspotApi.isOn(getContext());
        out.put("hotspot", power.parked() && always ? "Paused: low battery" : hotspotAttempt ? "Starting"
            : policyFailures >= 2 ? "Blocked - retry in settings" : on == null ? hotspot : on ? "On" : "Off");
        out.put("hotspot_always", always); out.put("last_code", lastCode);
        return out;
    }
    private void publish() { if (!destroyed) notifyListeners("networkState", state()); }
    private JSObject result(String id, String code) {
        JSObject r = new JSObject(); r.put("id", id); r.put("code", code); return r;
    }
    private void complete(String code) {
        if (destroyed) return;
        if (deadline != null) main.removeCallbacks(deadline);
        deadline = null;
        String id = pendingId;
        PluginCall call = pendingCall;
        pendingCall = null; pendingId = ""; pendingType = ""; lastCode = code;
        JSObject r = result(id, code);
        if (!id.isEmpty()) {
            completed.put(id, r);
            while (completed.size() > 32) completed.remove(completed.keySet().iterator().next());
        }
        publish(); if (call != null) call.resolve(r);
    }
    @PluginMethod public void getState(PluginCall call) { getActivity().runOnUiThread(() -> call.resolve(state())); }
    @PluginMethod public void setMode(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String next = call.getString("mode", "");
            mode = next.equals("driver") || next.equals("boarding") ? next : "";
            call.resolve();
        });
    }
    @PluginMethod public void setEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pendingCall != null || hotspotAttempt) { call.reject("Wait for the current network action to finish."); return; }
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            prefs.edit().putBoolean("enabled", enabled).apply();
            policyFailures = 0; publish(); call.resolve(state());
        });
    }
    @PluginMethod public void requestScanAccess(PluginCall call) {
        if (scanAllowed()) { call.resolve(state()); return; }
        requestPermissionForAliases(Build.VERSION.SDK_INT >= 33 ? new String[]{"scanLocation", "nearbyWifi"} : new String[]{"scanLocation"}, call, "scanPermissionResult");
    }
    @PermissionCallback private void scanPermissionResult(PluginCall call) { call.resolve(state()); }
    @PluginMethod public void openHotspotPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
                call.resolve();
            } catch (RuntimeException ignored) { call.reject("Open Android special app access > Modify system settings."); }
        });
    }
    @PluginMethod public void execute(PluginCall call) {
        JSObject cmd = call.getObject("command", new JSObject());
        getActivity().runOnUiThread(() -> executeOnMain(call, cmd));
    }
    private void executeOnMain(PluginCall call, JSObject cmd) {
        String id = cmd.optString("id", ""), type = cmd.optString("type", "");
        if (!NetworkInputPolicy.id(id)) { call.reject("Invalid network command."); return; }
        if (completed.containsKey(id)) { call.resolve(completed.get(id)); return; }
        if (pendingCall != null || hotspotAttempt) { call.reject("Network action already in progress."); return; }
        if (!enabled) { call.resolve(result(id, "NETWORK_DISABLED")); return; }
        if (!foreground || mode.isEmpty()) { call.resolve(result(id, "NETWORK_CONTEXT_REQUIRED")); return; }
        if (!Arrays.asList("wifi_scan", "wifi_join", "wifi_power", "hotspot").contains(type)) { call.reject("Unknown network command."); return; }
        if (type.equals("wifi_join") && (!NetworkInputPolicy.ssid(cmd.optString("ssid", "")) || !NetworkInputPolicy.password(cmd.optString("password", "")))) {
            call.reject("Invalid Wi-Fi details."); return;
        }
        if ((type.equals("hotspot") && !(cmd.opt("always_on") instanceof Boolean)) ||
            (type.equals("wifi_power") && !(cmd.opt("on") instanceof Boolean))) { call.reject("A switch value is required."); return; }
        pendingCall = call; pendingId = id; pendingType = type;
        if (type.equals("hotspot")) {
            if (!mode.equals("driver")) { complete("NETWORK_CONTEXT_REQUIRED"); return; }
            if (!cmd.optBoolean("always_on")) {
                always = false; prefs.edit().putBoolean("always", false).apply(); complete("HOTSPOT_POLICY_OFF"); return;
            }
            policyFailures = 0; beginHotspot(call, id); return;
        }
        if (!scanAllowed()) { complete("LOCATION_PERMISSION_REQUIRED"); return; }
        if (!locationOn()) { complete("LOCATION_SERVICES_REQUIRED"); return; }
        if (wifi == null) { complete("NETWORK_ERROR"); return; }
        if (type.equals("wifi_power")) {
            if (!managedWifi()) { complete("MANAGED_WIFI_REQUIRED"); return; }
            try { complete(wifi.setWifiEnabled(cmd.optBoolean("on")) ? "WIFI_POWER_REQUESTED" : "NETWORK_ERROR"); }
            catch (RuntimeException error) { complete("MANAGED_WIFI_REQUIRED"); }
            return;
        }
        if (!wifi.isWifiEnabled()) { complete("WIFI_OFF"); return; }
        if (type.equals("wifi_scan")) {
            if (SystemClock.elapsedRealtime() - lastScanAt < 30000 && lastScanAt != 0) { complete("WIFI_SCAN_UNAVAILABLE"); return; }
            lastScanAt = SystemClock.elapsedRealtime();
            try {
                if (!wifi.startScan()) { complete("WIFI_SCAN_UNAVAILABLE"); return; }
                deadline = () -> complete("WIFI_SCAN_UNAVAILABLE"); main.postDelayed(deadline, 12000);
            } catch (RuntimeException error) { complete("LOCATION_PERMISSION_REQUIRED"); }
        } else {
            if (!managedWifi()) { complete("MANAGED_WIFI_REQUIRED"); return; }
            join = new JSObject(); join.put("id", id); join.put("ssid", cmd.optString("ssid")); join.put("state", "joining"); join.put("at", iso());
            publish();
            final String ssid = cmd.optString("ssid"), password = cmd.optString("password");
            worker.execute(() -> join(ssid, password));
        }
    }
    private void finishScan() {
        if (!pendingType.equals("wifi_scan")) return;
        try {
            Map<String, ScanResult> best = new HashMap<>();
            for (ScanResult r : wifi.getScanResults()) {
                if (!NetworkInputPolicy.ssid(r.SSID) || SystemClock.elapsedRealtime() - r.timestamp / 1000 > 30000) continue;
                ScanResult old = best.get(r.SSID);
                if (old == null || old.level < r.level) best.put(r.SSID, r);
            }
            List<ScanResult> list = new ArrayList<>(best.values()); list.sort((a, b) -> Integer.compare(b.level, a.level));
            networks = new JSArray();
            for (int i = 0; i < Math.min(25, list.size()); i++) {
                ScanResult r = list.get(i); JSObject n = new JSObject();
                n.put("ssid", r.SSID); n.put("bars", WifiManager.calculateSignalLevel(r.level, 5));
                n.put("lock", NetworkInputPolicy.lock(r.capabilities)); networks.put(n);
            }
            scannedAt = iso(); complete("WIFI_SCAN_COMPLETE");
        } catch (RuntimeException error) { complete("LOCATION_PERMISSION_REQUIRED"); }
    }
    private boolean waitFor(int id, long timeout) throws InterruptedException {
        long end = SystemClock.elapsedRealtime() + timeout;
        while (SystemClock.elapsedRealtime() < end) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
            WifiInfo info = wifi.getConnectionInfo();
            if (info != null && info.getNetworkId() == id && info.getSupplicantState() == SupplicantState.COMPLETED) return true;
            Thread.sleep(1000);
        }
        return false;
    }
    private void join(String ssid, String password) {
        int before = -1, target = -1; boolean created = false, ok = false;
        try {
            before = wifi.getConnectionInfo().getNetworkId();
            String quoted = NetworkInputPolicy.quote(ssid);
            List<WifiConfiguration> saved = wifi.getConfiguredNetworks();
            if (saved != null) for (WifiConfiguration n : saved) if (quoted.equals(n.SSID)) { target = n.networkId; break; }
            // Existing Android credentials are never overwritten: change them in Android settings.
            if (target == -1) {
                WifiConfiguration n = new WifiConfiguration(); n.SSID = quoted;
                if (password.isEmpty()) n.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE);
                else { n.preSharedKey = NetworkInputPolicy.quote(password); n.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK); }
                target = wifi.addNetwork(n); created = target != -1;
            }
            if (target != -1 && wifi.enableNetwork(target, true)) { wifi.reconnect(); ok = waitFor(target, 45000); }
        } catch (RuntimeException | InterruptedException ignored) { }
        if (!ok) {
            try {
                if (created && target != -1) wifi.removeNetwork(target);
                if (before != -1) { wifi.enableNetwork(before, true); wifi.reconnect(); }
            } catch (RuntimeException ignored) { }
        }
        try {
            List<WifiConfiguration> saved = wifi.getConfiguredNetworks();
            if (saved != null) for (WifiConfiguration n : saved) wifi.enableNetwork(n.networkId, false);
        } catch (RuntimeException ignored) { }
        final boolean connected = ok;
        main.post(() -> {
            if (destroyed) return;
            join.put("state", connected ? "connected" : "failed");
            join.put("message", connected ? "Connected to the selected Wi-Fi. Internet access is checked separately."
                : "Could not connect. Previous network was requested again; check Android settings.");
            join.put("at", iso());
            complete(connected ? "WIFI_JOIN_CONNECTED" : "WIFI_JOIN_FAILED");
        });
    }
    private void updatePower() {
        Intent b = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b == null) return;
        int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
        power.update(level >= 0 && scale > 0 && level <= scale ? Math.round(level * 100f / scale) : -1, plugged < 0 ? null : plugged != 0);
    }
    private void beginHotspot(PluginCall call, String id) {
        updatePower();
        if (Build.VERSION.SDK_INT != 29) { hotspotFailed(call, "HOTSPOT_UNSUPPORTED"); return; }
        if (!Settings.System.canWrite(getContext())) { hotspotFailed(call, "HOTSPOT_PERMISSION_REQUIRED"); return; }
        if (power.parked()) { hotspotFailed(call, "LOW_BATTERY"); return; }
        hotspotAttempt = true;
        final long expires = SystemClock.elapsedRealtime() + 10000;
        final boolean[] failed = { false };
        if (!Boolean.TRUE.equals(TabletHotspotApi.isOn(getContext())) &&
            !TabletHotspotApi.request(getContext(), true, ok -> { if (!ok) failed[0] = true; })) {
            hotspotAttempt = false; hotspotFailed(call, "HOTSPOT_UNSUPPORTED"); return;
        }
        Runnable check = new Runnable() {
            @Override public void run() {
                if (destroyed) return;
                if (failed[0]) { hotspotAttempt = false; hotspotFailed(call, "HOTSPOT_NOT_CONFIRMED"); return; }
                if (Boolean.TRUE.equals(TabletHotspotApi.isOn(getContext()))) {
                    hotspotAttempt = false; ownedHotspot = true; always = true; policyFailures = 0; hotspot = "On";
                    prefs.edit().putBoolean("always", true).apply();
                    if (call != null) complete("HOTSPOT_ON"); else publish();
                } else if (SystemClock.elapsedRealtime() >= expires) {
                    hotspotAttempt = false; hotspotFailed(call, "HOTSPOT_NOT_CONFIRMED");
                } else main.postDelayed(this, 500);
            }
        };
        main.post(check);
    }
    private void hotspotFailed(PluginCall call, String code) {
        policyFailures++; hotspot = "Blocked - check Android hotspot settings";
        if (call != null) complete(code); else publish();
    }
    @Override protected void handleOnPause() { foreground = false; }
    @Override protected void handleOnResume() { foreground = true; main.removeCallbacks(watchdog); main.post(watchdog); publish(); }
    @Override protected void handleOnDestroy() {
        destroyed = true; main.removeCallbacksAndMessages(null); worker.shutdownNow();
        try { getContext().unregisterReceiver(scanReady); } catch (IllegalArgumentException ignored) { }
        if (pendingCall != null) pendingCall.reject("Tablet screen closed during network action.");
    }
}
