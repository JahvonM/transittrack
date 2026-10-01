package com.transittrack.kioskhelper;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ResultReceiver;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/**
 * Turns the tablet's Wi-Fi hotspot on/off (driver tablets share the bus SIM's internet with the
 * boarding tablet). Android 10 has no public API for this, so it uses the system tethering call.
 * Needs, once per tablet via adb:
 *   adb shell appops set com.transittrack.kioskhelper WRITE_SETTINGS allow
 *   adb shell settings put global hidden_api_policy 1
 * The hotspot name/password are whatever is set in Android's hotspot settings.
 */
final class Hotspot {
    private Hotspot() {}
    private static final int TETHERING_WIFI = 0;

    static boolean isOn(Context c) {
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            Method m = WifiManager.class.getDeclaredMethod("isWifiApEnabled");
            m.setAccessible(true);
            return Boolean.TRUE.equals(m.invoke(wm));
        } catch (Throwable t) {
            return false;
        }
    }

    /** Returns a short result for the log: "requested", or why it couldn't. */
    static String set(final Context c, final boolean on) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            Field f = ConnectivityManager.class.getDeclaredField("mService");
            f.setAccessible(true);
            Object svc = f.get(cm);
            String pkg = c.getPackageName();
            ResultReceiver rr = new ResultReceiver(new Handler(Looper.getMainLooper())) {
                @Override protected void onReceiveResult(int code, Bundle data) {
                    if (code == 0) {
                        Status.hotspot = on ? "On" : "Off";
                        Status.log("Hotspot " + (on ? "on" : "off"));
                    } else {
                        Status.hotspot = "Failed (" + code + ")";
                        Status.log("Hotspot " + (on ? "start" : "stop") + " failed, code " + code
                                + (code == 3 || code == 11 ? " (no mobile data / provisioning?)" : ""));
                    }
                }
            };
            for (Method m : svc.getClass().getMethods()) {
                Class<?>[] p = m.getParameterTypes();
                if (on && m.getName().equals("startTethering")) {
                    if (p.length == 4 && p[0] == int.class && p[1] == ResultReceiver.class && p[2] == boolean.class && p[3] == String.class) {
                        m.invoke(svc, TETHERING_WIFI, rr, false, pkg);
                        return "requested";
                    }
                    if (p.length == 3 && p[0] == int.class && p[1] == ResultReceiver.class && p[2] == boolean.class) {
                        m.invoke(svc, TETHERING_WIFI, rr, false);
                        return "requested";
                    }
                }
                if (!on && m.getName().equals("stopTethering")) {
                    if (p.length == 2 && p[0] == int.class && p[1] == String.class) { m.invoke(svc, TETHERING_WIFI, pkg); Status.hotspot = "Off"; return "requested"; }
                    if (p.length == 1 && p[0] == int.class) { m.invoke(svc, TETHERING_WIFI); Status.hotspot = "Off"; return "requested"; }
                }
            }
            return "not available on this Android version";
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            if (cause instanceof SecurityException) return "blocked - run: adb shell appops set " + c.getPackageName() + " WRITE_SETTINGS allow";
            return "error: " + cause;
        } catch (NoSuchFieldException | IllegalAccessException e) {
            return "blocked - run: adb shell settings put global hidden_api_policy 1";
        } catch (Throwable t) {
            return "error: " + t;
        }
    }
}
