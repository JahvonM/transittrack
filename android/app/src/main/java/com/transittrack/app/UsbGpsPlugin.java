package com.transittrack.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.BatteryManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground driver GPS. Off by default; no mock-location grant or network server. */
@CapacitorPlugin(name = "UsbGps")
public class UsbGpsPlugin extends Plugin {
    private final ExecutorService worker = GpsUsbRuntime.worker;
    private static volatile java.lang.ref.WeakReference<UsbGpsPlugin> current = new java.lang.ref.WeakReference<>(null);
    static void nativeOwnershipChanged() {
        UsbGpsPlugin p = current.get();
        if (p != null) p.getActivity().runOnUiThread(() -> {
            if (DriverLocationService.active()) p.stopReader(); else if (p.enabled && p.foreground) p.startReader();
            p.notifyListeners("gpsState", p.state());
        });
    }
    static void nativePosition(JSObject position) {
        UsbGpsPlugin p = current.get();
        if (p != null && p.foreground) p.notifyListeners("gpsPosition", position);
    }
    private UsbGpsReader reader;
    private final TabletPowerPolicy power = new TabletPowerPolicy();
    private final BroadcastReceiver batteryChanged = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { updateBattery(intent); }
    };
    private SharedPreferences preferences;
    private volatile String status = "Off";
    private volatile long lastFixAt;
    private volatile boolean enabled;
    private volatile boolean foreground = true;
    private final BroadcastReceiver permissionResult = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            UsbAutoAcceptService.clearPending(getContext(), "gps");
            if (!intent.getBooleanExtra(android.hardware.usb.UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                // Asked again a minute later, like the Helper; never switched off.
                report("USB access not allowed yet - asking again in a minute");
            } else if (reader != null) reader.rescan();
        }
    };

    @Override public void load() {
        current = new java.lang.ref.WeakReference<>(this);
        preferences = getContext().getSharedPreferences("transittrack_usb_gps", Context.MODE_PRIVATE);
        enabled = preferences.getBoolean("enabled", false);
        IntentFilter filter = new IntentFilter(UsbGpsReader.ACTION_PERMISSION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(permissionResult, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(permissionResult, filter);
        IntentFilter batteryFilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent battery;
        if (Build.VERSION.SDK_INT >= 33) battery = getContext().registerReceiver(batteryChanged, batteryFilter, Context.RECEIVER_NOT_EXPORTED);
        else battery = getContext().registerReceiver(batteryChanged, batteryFilter);
        updateBattery(battery);
        if (enabled) { UsbAutoAcceptService.ensureEnabled(getContext()); startReader(); }
    }

    private void updateBattery(Intent battery) {
        if (battery == null) return;
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int percent = level >= 0 && scale > 0 && level <= scale ? Math.round(level * 100f / scale) : -1;
        int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
        boolean wasParked = power.parked();
        boolean parked = power.update(percent, plugged < 0 ? null : plugged != 0);
        if (wasParked == parked) return;
        TabletDiagnostics.record("gps", parked ? "GPS_LOW_BATTERY_PARKED" : "GPS_POWER_RESTORED");
        if (parked) {
            stopReader();
            if (enabled) report("GPS paused: low battery - connect charger");
        } else if (enabled && foreground) startReader();
        notifyListeners("gpsState", state());
    }

    JSObject state() {
        JSObject value = new JSObject();
        value.put("available", true);
        value.put("autoAcceptEnabled", UsbAutoAcceptService.isEnabled(getContext()));
        value.put("enabled", enabled);
        value.put("powerParked", power.parked());
        value.put("status", status);
        value.put("lastFixAt", lastFixAt);
        value.put("backgroundManaged", DriverLocationService.active());
        if (DriverLocationService.active()) {
            value.put("status", DriverLocationService.status());
            JSObject latest = DriverLocationService.position();
            if (latest != null) value.put("lastFixAt", latest.optLong("timestamp"));
            value.put("lastSentAt", DriverLocationService.lastSentAt());
        }
        return value;
    }

    private void report(String message) {
        status = message;
        TabletDiagnostics.record("gps", message.startsWith("Fix (") ? "GPS_FIX" : message.equals("Not plugged in") ? "GPS_DISCONNECTED" : "GPS_STATUS_CHANGED");
        notifyListeners("gpsState", state());
    }

    private void startReader() {
        if (!enabled || !foreground || reader != null || DriverLocationService.active()) return;
        if (power.parked()) { report("GPS paused: low battery - connect charger"); return; }
        report("Looking for USB GPS");
        UsbGpsReader next = new UsbGpsReader(getContext(), new UsbGpsReader.Listener() {
            @Override public void onStatus(String message) {
                if (enabled && foreground && !power.parked()) report(message);
            }
            @Override public void onFix(NmeaGpsParser.Fix fix) {
                if (!enabled || !foreground || power.parked()) return;
                lastFixAt = fix.timestamp;
                JSObject coords = new JSObject();
                coords.put("latitude", fix.latitude); coords.put("longitude", fix.longitude);
                coords.put("accuracy", fix.accuracy);
                if (Double.isFinite(fix.speed)) coords.put("speed", fix.speed);
                if (Double.isFinite(fix.heading)) coords.put("heading", fix.heading);
                if (Double.isFinite(fix.altitude)) coords.put("altitude", fix.altitude);
                JSObject position = new JSObject();
                position.put("coords", coords); position.put("timestamp", fix.timestamp);
                position.put("satellites", fix.satellites);
                notifyListeners("gpsPosition", position);
            }
        });
        reader = next;
        // Serialize old-reader cleanup and a subsequent start, including rapid toggles.
        worker.execute(next);
    }

    private void stopReader() {
        if (reader != null) { reader.stop(); reader = null; }
        lastFixAt = 0;
    }

    @PluginMethod public void getState(PluginCall call) { call.resolve(state()); }

    @PluginMethod public void setEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            preferences.edit().putBoolean("enabled", enabled).apply();
            if (DriverLocationService.active()) DriverLocationService.sourceChanged();
            if (enabled) { UsbAutoAcceptService.ensureEnabled(getContext()); startReader(); }
            else {
                stopReader();
                UsbAutoAcceptService.clearPending(getContext(), "gps");
                report("Off");
            }
            call.resolve(state());
        });
    }

    @PluginMethod public void openAutoAcceptSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS));
                call.resolve();
            } catch (RuntimeException error) { call.reject("Could not open Android Accessibility settings."); }
        });
    }

    @PluginMethod public void rescan(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (reader != null) reader.rescan();
            else if (enabled) startReader();
            call.resolve(state());
        });
    }

    @Override protected void handleOnPause() {
        foreground = false;
        stopReader();
        if (enabled) report("Paused while app is in background");
    }

    @Override protected void handleOnResume() {
        foreground = true;
        if (enabled) startReader();
        else report(status);
    }

    @Override protected void handleOnDestroy() {
        foreground = false; stopReader();
        if (current.get() == this) current.clear();
        try { getContext().unregisterReceiver(batteryChanged); } catch (IllegalArgumentException ignored) { }
        try { getContext().unregisterReceiver(permissionResult); } catch (IllegalArgumentException ignored) { }
    }
}
