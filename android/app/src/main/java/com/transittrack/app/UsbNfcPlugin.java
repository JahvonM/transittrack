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

@CapacitorPlugin(name = "UsbNfc")
public class UsbNfcPlugin extends Plugin {
    static final String PREFS = "transittrack_usb_nfc";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final TapReceipt receipt = new TapReceipt();
    private SharedPreferences preferences;
    private UsbNfcReader reader;
    private volatile boolean enabled, ready, foreground = true;
    private volatile String status = "Off", delivery = "No tap yet";
    private volatile long lastTapAt;
    private final BroadcastReceiver permissionResult = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            UsbAutoAcceptService.clearPending(context, "nfc");
            if (!intent.getBooleanExtra(android.hardware.usb.UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                enabled = false; preferences.edit().putBoolean("enabled", false).apply();
                stopReader(); report("USB permission denied - enable reader to retry");
            } else if (reader != null) reader.reconnect();
        }
    };

    @Override public void load() {
        preferences = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        enabled = preferences.getBoolean("enabled", false);
        IntentFilter filter = new IntentFilter(UsbNfcReader.ACTION_PERMISSION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(permissionResult, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(permissionResult, filter);
        // Wait for the boarding screen to announce readiness before claiming USB.
    }
    private JSObject state() {
        JSObject out = new JSObject();
        out.put("available", true); out.put("enabled", enabled); out.put("ready", ready);
        out.put("status", status); out.put("delivery", delivery); out.put("lastTapAt", lastTapAt);
        out.put("autoAcceptEnabled", UsbAutoAcceptService.isEnabled(getContext()));
        return out;
    }
    private void report(String message) {
        status = message;
        notifyListeners("readerState", state());
    }
    private void startReader() {
        if (!enabled || !foreground || !ready || reader != null) return;
        report("Looking for USB reader");
        UsbNfcReader next = new UsbNfcReader(getContext(), receipt, new UsbNfcReader.Listener() {
            @Override public boolean isReady() { return ready && enabled && foreground; }
            @Override public void onTap(String uid, String tapId, long at) {
                if (!isReady()) return;
                lastTapAt = at;
                JSObject tap = new JSObject();
                tap.put("uid", uid); tap.put("tapId", tapId); tap.put("at", at);
                notifyListeners("card", tap);
            }
            @Override public void onStatus(String message) { if (enabled && foreground) report(message); }
            @Override public void onDelivery(String message) {
                if (!enabled || !foreground) return;
                delivery = message; notifyListeners("readerState", state());
            }
        });
        reader = next; worker.execute(next);
    }
    private void stopReader() {
        if (reader != null) { reader.stop(); reader = null; }
        receipt.cancel();
    }
    @PluginMethod public void getState(PluginCall call) { call.resolve(state()); }
    @PluginMethod public void setReady(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ready = Boolean.TRUE.equals(call.getBoolean("ready", false));
            if (ready) startReader();
            else { stopReader(); if (enabled) report("Waiting for boarding screen"); }
            call.resolve(state());
        });
    }
    @PluginMethod public void setEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            preferences.edit().putBoolean("enabled", enabled).apply();
            if (enabled) { startReader(); if (!ready) report("Waiting for boarding screen"); }
            else { stopReader(); UsbAutoAcceptService.clearPending(getContext(), "nfc"); report("Off"); }
            call.resolve(state());
        });
    }
    @PluginMethod public void acknowledge(PluginCall call) {
        String id = call.getString("tapId");
        Boolean accepted = call.getBoolean("accepted");
        if (id == null || accepted == null) { call.reject("A tap ID and result are required."); return; }
        JSObject result = new JSObject();
        result.put("acknowledged", receipt.acknowledge(id, accepted, System.currentTimeMillis()));
        call.resolve(result);
    }
    @PluginMethod public void rescan(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (reader != null) reader.reconnect(); else startReader();
            call.resolve(state());
        });
    }
    @Override protected void handleOnPause() {
        foreground = false; stopReader();
        if (enabled) report("Paused while app is in background");
    }
    @Override protected void handleOnResume() {
        foreground = true; startReader();
        notifyListeners("readerState", state());
    }
    @Override protected void handleOnDestroy() {
        foreground = false; ready = false; stopReader(); worker.shutdownNow();
        try { getContext().unregisterReceiver(permissionResult); } catch (IllegalArgumentException ignored) { }
    }
}
