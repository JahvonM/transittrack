package com.transittrack.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.content.*;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.UUID;

@CapacitorPlugin(name = "BoardingBluetooth", permissions = @Permission(
    alias = "boarding", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE }))
public class BoardingBluetoothPlugin extends Plugin {
    private SharedPreferences prefs;
    private BoardingBleReceiver receiver;
    private boolean enabled, ready, foreground = true, destroyed;
    private String busName = "", status = "Off";
    private final BroadcastReceiver adapterChanged = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            getActivity().runOnUiThread(() -> { if (!destroyed) update(); });
        }
    };
    @Override public void load() {
        prefs = getContext().getSharedPreferences("transittrack_boarding_bluetooth", Context.MODE_PRIVATE);
        enabled = prefs.getBoolean("enabled", false);
        receiver = new BoardingBleReceiver(getContext(), new BoardingBleReceiver.Sink() {
            @Override public void status(String message) { report(message); }
            @Override public void code(String code) {
                if (destroyed || !enabled || !ready || !foreground) return;
                JSObject event = new JSObject();
                event.put("id", "ble-native-" + UUID.randomUUID()); event.put("code", code);
                event.put("at", System.currentTimeMillis());
                notifyListeners("boardingCode", event);
            }
        });
        IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        // Bluetooth system broadcasts can originate in a privileged Bluetooth process.
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(adapterChanged, filter, Context.RECEIVER_EXPORTED);
        else getContext().registerReceiver(adapterChanged, filter);
    }
    private boolean permitted() {
        return Build.VERSION.SDK_INT < 31 || getPermissionState("boarding") == PermissionState.GRANTED;
    }
    private void report(String message) {
        status = message;
        notifyListeners("receiverState", state());
    }
    JSObject state() {
        JSObject out = new JSObject();
        out.put("available", true); out.put("enabled", enabled);
        out.put("ready", ready && foreground); out.put("status", status);
        out.put("permissionGranted", permitted());
        return out;
    }
    private void update() {
        if (destroyed) return;
        if (!enabled || !ready || !foreground || !permitted()) {
            receiver.stop();
            report(!enabled ? "Off" : !permitted() ? "Bluetooth permission is required"
                : !foreground ? "Paused while app is in background" : "Waiting for boarding screen");
            return;
        }
        receiver.start(busName);
    }
    @PluginMethod public void getState(PluginCall call) { call.resolve(state()); }
    @PluginMethod public void setReady(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ready = Boolean.TRUE.equals(call.getBoolean("ready", false));
            busName = BoardingBleProtocol.name(call.getString("name", ""));
            update(); call.resolve(state());
        });
    }
    @PluginMethod public void setEnabled(PluginCall call) {
        if (Boolean.TRUE.equals(call.getBoolean("enabled", false)) && !permitted()) {
            requestPermissionForAlias("boarding", call, "permissionResult");
            return;
        }
        applyEnabled(call);
    }
    @PermissionCallback private void permissionResult(PluginCall call) {
        if (!permitted()) { call.reject("Nearby devices permission was denied. Use NFC, QR or your code."); return; }
        applyEnabled(call);
    }
    private void applyEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (destroyed) { call.reject("Tablet screen was closed."); return; }
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            prefs.edit().putBoolean("enabled", enabled).apply();
            if (!enabled) receiver.close();
            update(); call.resolve(state());
        });
    }
    @PluginMethod public void retry(PluginCall call) {
        getActivity().runOnUiThread(() -> { receiver.stop(); update(); call.resolve(state()); });
    }
    @PluginMethod public void openSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)); call.resolve(); }
            catch (RuntimeException error) { call.reject("Could not open Android Bluetooth settings."); }
        });
    }
    @Override protected void handleOnPause() { foreground = false; update(); }
    @Override protected void handleOnResume() { foreground = true; update(); }
    @Override protected void handleOnDestroy() {
        destroyed = true; ready = false; receiver.close();
        try { getContext().unregisterReceiver(adapterChanged); } catch (IllegalArgumentException ignored) { }
    }
}
