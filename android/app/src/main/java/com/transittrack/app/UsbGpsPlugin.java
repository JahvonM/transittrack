package com.transittrack.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
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
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private UsbGpsReader reader;
    private SharedPreferences preferences;
    private volatile String status = "Off";
    private volatile long lastFixAt;
    private volatile boolean enabled;
    private volatile boolean foreground = true;
    private final BroadcastReceiver permissionResult = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            UsbAutoAcceptService.clearPending(getContext(), "gps");
            if (!intent.getBooleanExtra(android.hardware.usb.UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                enabled = false;
                preferences.edit().putBoolean("enabled", false).apply();
                stopReader(); report("USB permission denied. Enable USB GPS to try again.");
            } else if (reader != null) reader.rescan();
        }
    };

    @Override public void load() {
        preferences = getContext().getSharedPreferences("transittrack_usb_gps", Context.MODE_PRIVATE);
        enabled = preferences.getBoolean("enabled", false);
        IntentFilter filter = new IntentFilter(UsbGpsReader.ACTION_PERMISSION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(permissionResult, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(permissionResult, filter);
        if (enabled) startReader();
    }

    private JSObject state() {
        JSObject value = new JSObject();
        value.put("available", true);
        value.put("autoAcceptEnabled", UsbAutoAcceptService.isEnabled(getContext()));
        value.put("enabled", enabled);
        value.put("status", status);
        value.put("lastFixAt", lastFixAt);
        return value;
    }

    private void report(String message) {
        status = message;
        notifyListeners("gpsState", state());
    }

    private void startReader() {
        if (!enabled || !foreground || reader != null) return;
        report("Looking for USB GPS");
        UsbGpsReader next = new UsbGpsReader(getContext(), new UsbGpsReader.Listener() {
            @Override public void onStatus(String message) {
                if (enabled && foreground) report(message);
            }
            @Override public void onFix(NmeaGpsParser.Fix fix) {
                if (!enabled || !foreground) return;
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
            if (enabled) startReader();
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
        foreground = false; stopReader(); worker.shutdownNow();
        try { getContext().unregisterReceiver(permissionResult); } catch (IllegalArgumentException ignored) { }
    }
}
