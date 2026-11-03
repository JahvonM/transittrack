package com.transittrack.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.nfc.NfcAdapter;
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
    // The device's own NFC (e.g. the Telpo T10 validator). On by default, separate from
    // the USB reader switch, and only reads while the boarding screen is open.
    private BuiltInNfcReader builtIn;
    private volatile boolean builtInEnabled = true;
    private volatile String builtInStatus = "Off";
    private final BroadcastReceiver nfcSwitch = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (getActivity() != null) getActivity().runOnUiThread(UsbNfcPlugin.this::syncBuiltIn);
        }
    };
    private final BroadcastReceiver permissionResult = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            UsbAutoAcceptService.clearPending(context, "nfc");
            if (!intent.getBooleanExtra(android.hardware.usb.UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                // Like the Helper: a cancelled or closed popup is asked again a minute
                // later. It never switches the reader off (Android also reports a popup
                // that closed by itself, e.g. when the screen changed, as refused).
                report("USB access not allowed yet - asking again in a minute");
            } else if (reader != null) reader.reconnect();
        }
    };

    /** The reader is on unless someone switched it off in the boarding settings, like the
     *  Helper. It only reads while the boarding screen is open, so driver tablets are
     *  unaffected. While the old Helper app is still installed it stays off unless switched
     *  on, so the two apps never fight over the reader. */
    static boolean readerEnabled(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (p.contains("enabled")) return p.getBoolean("enabled", false);
        return !helperInstalled(context);
    }
    static final String OLD_HELPER = "com.transittrack.kioskhelper";
    static boolean helperInstalled(Context context) {
        try { context.getPackageManager().getPackageInfo(OLD_HELPER, 0); return true; }
        catch (android.content.pm.PackageManager.NameNotFoundException e) { return false; }
    }

    @Override public void load() {
        preferences = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        enabled = readerEnabled(getContext());
        if (enabled) UsbAutoAcceptService.ensureEnabled(getContext());
        IntentFilter filter = new IntentFilter(UsbNfcReader.ACTION_PERMISSION);
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(permissionResult, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(permissionResult, filter);
        // Wait for the boarding screen to announce readiness before claiming USB.
        builtInEnabled = preferences.getBoolean("builtin_enabled", true);
        builtIn = new BuiltInNfcReader(getContext(), new BuiltInNfcReader.Listener() {
            @Override public boolean isReady() { return ready && builtInEnabled && foreground; }
            @Override public void onTap(String uid, String tapId, long at) { if (isReady()) sendTap(uid, tapId, at); }
            @Override public void onDelivery(String message) { if (builtInEnabled && foreground) noteDelivery(message); }
        });
        if (builtIn.available()) {
            IntentFilter nfc = new IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED);
            if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(nfcSwitch, nfc, Context.RECEIVER_NOT_EXPORTED);
            else getContext().registerReceiver(nfcSwitch, nfc);
            builtInStatus = "Waiting for boarding screen";
        }
    }
    JSObject state() {
        JSObject out = new JSObject();
        out.put("available", true); out.put("enabled", enabled); out.put("ready", ready);
        out.put("status", status); out.put("delivery", delivery); out.put("lastTapAt", lastTapAt);
        out.put("autoAcceptEnabled", UsbAutoAcceptService.isEnabled(getContext()));
        boolean has = builtIn != null && builtIn.available();
        JSObject own = new JSObject();
        own.put("available", has); own.put("enabled", builtInEnabled);
        own.put("on", has && builtIn.isOn()); own.put("nfcOn", has && builtIn.nfcSwitchedOn());
        own.put("status", has ? builtInStatus : "Not on this device");
        out.put("builtIn", own);
        return out;
    }
    private void sendTap(String uid, String tapId, long at) {
        if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).noteTabletInteraction();
        lastTapAt = at;
        JSObject tap = new JSObject();
        tap.put("uid", uid); tap.put("tapId", tapId); tap.put("at", at);
        notifyListeners("card", tap);
    }
    private void noteDelivery(String message) {
        delivery = message;
        TabletDiagnostics.record("reader", message.startsWith("Card recognized") ? "TAP_ACCEPTED"
            : message.startsWith("Card rejected") ? "TAP_REJECTED"
            : message.startsWith("Retrying") ? "TAP_RETRY"
            : message.startsWith("App did not") ? "TAP_UNCONFIRMED" : "TAP_PENDING");
        notifyListeners("readerState", state());
    }
    /** UI thread. Turns the device's own NFC reading on only while it can be used. */
    private void syncBuiltIn() {
        if (builtIn == null || !builtIn.available()) return;
        String next;
        if (!builtInEnabled) { builtIn.stop(getActivity()); next = "Off"; }
        else if (!foreground) { builtIn.stop(getActivity()); next = "Paused while app is in background"; }
        else if (!builtIn.nfcSwitchedOn()) { builtIn.stop(getActivity()); next = "NFC is off in Android settings"; }
        else if (!ready) { builtIn.stop(getActivity()); next = "Waiting for boarding screen"; }
        else next = builtIn.start(getActivity()) ? "Ready for cards" : "Could not start - reopen the boarding screen";
        if (next.equals(builtInStatus)) return;
        builtInStatus = next;
        TabletDiagnostics.record("reader", next.equals("Ready for cards") ? "BUILTIN_NFC_READY" : "BUILTIN_NFC_STATUS");
        notifyListeners("readerState", state());
    }
    private void report(String message) {
        status = message;
        TabletDiagnostics.record("reader", message.equals("Connected") ? "READER_CONNECTED"
            : message.equals("Not plugged in") ? "READER_DISCONNECTED"
            : message.startsWith("USB permission denied") ? "USB_PERMISSION_DENIED" : "READER_STATUS_CHANGED");
        notifyListeners("readerState", state());
    }
    private void startReader() {
        if (!enabled || !foreground || !ready || reader != null) return;
        report("Looking for USB reader");
        UsbNfcReader next = new UsbNfcReader(getContext(), receipt, new UsbNfcReader.Listener() {
            @Override public boolean isReady() { return ready && enabled && foreground; }
            @Override public void onTap(String uid, String tapId, long at) { if (isReady()) sendTap(uid, tapId, at); }
            @Override public void onStatus(String message) { if (enabled && foreground) report(message); }
            @Override public void onDelivery(String message) { if (enabled && foreground) noteDelivery(message); }
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
            syncBuiltIn();
            call.resolve(state());
        });
    }
    @PluginMethod public void setEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            preferences.edit().putBoolean("enabled", enabled).apply();
            if (enabled) { UsbAutoAcceptService.ensureEnabled(getContext()); startReader(); if (!ready) report("Waiting for boarding screen"); }
            else { stopReader(); UsbAutoAcceptService.clearPending(getContext(), "nfc"); report("Off"); }
            call.resolve(state());
        });
    }
    @PluginMethod public void setBuiltInEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            builtInEnabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            preferences.edit().putBoolean("builtin_enabled", builtInEnabled).apply();
            syncBuiltIn();
            call.resolve(state());
        });
    }
    @PluginMethod public void openNfcSettings(PluginCall call) {
        try {
            getContext().startActivity(new Intent(android.provider.Settings.ACTION_NFC_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("NFC settings could not be opened on this device.");
        }
    }
    @PluginMethod public void acknowledge(PluginCall call) {
        String id = call.getString("tapId");
        Boolean accepted = call.getBoolean("accepted");
        if (id == null || accepted == null) { call.reject("A tap ID and result are required."); return; }
        long now = System.currentTimeMillis();
        boolean done = receipt.acknowledge(id, accepted, now)
            || (builtIn != null && builtIn.acknowledge(id, accepted, now));
        JSObject result = new JSObject();
        result.put("acknowledged", done);
        call.resolve(result);
    }
    @PluginMethod public void rescan(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (reader != null) reader.reconnect(); else startReader();
            syncBuiltIn();
            call.resolve(state());
        });
    }
    @Override protected void handleOnPause() {
        foreground = false; stopReader();
        if (enabled) report("Paused while app is in background");
        syncBuiltIn();
    }
    @Override protected void handleOnResume() {
        foreground = true; startReader();
        syncBuiltIn();
        notifyListeners("readerState", state());
    }
    @Override protected void handleOnDestroy() {
        foreground = false; ready = false; stopReader(); worker.shutdownNow();
        if (builtIn != null) {
            builtIn.stop(getActivity()); builtIn.shutdown();
            if (builtIn.available()) try { getContext().unregisterReceiver(nfcSwitch); } catch (IllegalArgumentException ignored) { }
        }
        try { getContext().unregisterReceiver(permissionResult); } catch (IllegalArgumentException ignored) { }
    }
}
