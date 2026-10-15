package com.transittrack.app;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.StatFs;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TabletHealth")
public class TabletHealthPlugin extends Plugin {
    @Override public void load() { TabletDiagnostics.record("system", "APP_STARTED"); }

    @PluginMethod public void openWifiSettings(PluginCall call) { openSettings(call, android.provider.Settings.ACTION_WIFI_SETTINGS); }
    @PluginMethod public void openHotspotSettings(PluginCall call) { openSettings(call, "android.settings.TETHER_SETTINGS"); }
    private void openSettings(PluginCall call, String action) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(action)); call.resolve(); }
            catch (RuntimeException error) { call.reject("Could not open Android network settings."); }
        });
    }

    @PluginMethod public void getSnapshot(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true); out.put("at", System.currentTimeMillis());
        out.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        out.put("androidVersion", Build.VERSION.RELEASE);
        out.put("androidApi", Build.VERSION.SDK_INT);
        try {
            Intent b = getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b != null) {
                int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) out.put("battery", Math.round(level * 100f / scale));
                out.put("charging", b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0);
                int temp = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
                if (temp != Integer.MIN_VALUE) out.put("batteryTemperature", temp / 10.0);
            }
        } catch (RuntimeException ignored) { }
        try {
            StatFs storage = new StatFs(getContext().getFilesDir().getAbsolutePath());
            out.put("freeStorageMb", storage.getAvailableBytes() / (1024 * 1024));
            out.put("totalStorageMb", storage.getTotalBytes() / (1024 * 1024));
        } catch (RuntimeException ignored) { }
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= 23 && cm != null) {
                Network network = cm.getActiveNetwork();
                NetworkCapabilities n = cm.getNetworkCapabilities(network);
                out.put("network", n == null ? "offline" : n.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi"
                    : n.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "mobile" : "other");
                out.put("internetValidated", n != null && n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
            }
        } catch (RuntimeException ignored) { out.put("network", "unknown"); }
        try {
            UsbManager usb = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
            if (usb != null) out.put("usbDevices", usb.getDeviceList().size());
            if (Build.VERSION.SDK_INT >= 29) {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null) out.put("thermalStatus", pm.getCurrentThermalStatus());
            }
        } catch (RuntimeException ignored) { }
        try {
            out.put("gps", ((UsbGpsPlugin) getBridge().getPlugin("UsbGps").getInstance()).state());
            out.put("reader", ((UsbNfcPlugin) getBridge().getPlugin("UsbNfc").getInstance()).state());
        } catch (Exception ignored) { }
        out.put("events", TabletDiagnostics.snapshot());
        call.resolve(out);
    }
}
