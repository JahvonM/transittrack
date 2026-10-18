package com.transittrack.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.os.*;
import java.lang.reflect.*;

/** Existing helper's Android-10 OEM path. No global hidden-API policy changes. */
final class TabletHotspotApi {
    interface Result { void result(boolean ok); }
    static Boolean isOn(Context context) {
        if (Build.VERSION.SDK_INT != 29) return null;
        try {
            WifiManager wifi = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            return (Boolean) WifiManager.class.getDeclaredMethod("isWifiApEnabled").invoke(wifi);
        } catch (Exception ignored) { return null; }
    }
    static boolean request(Context context, boolean on, Result result) {
        if (Build.VERSION.SDK_INT != 29) return false;
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Field field = ConnectivityManager.class.getDeclaredField("mService"); field.setAccessible(true);
            Object service = field.get(cm);
            ResultReceiver callback = new ResultReceiver(new Handler(Looper.getMainLooper())) {
                @Override protected void onReceiveResult(int code, Bundle data) { result.result(code == 0); }
            };
            for (Method m : service.getClass().getMethods()) {
                Class<?>[] p = m.getParameterTypes();
                if (on && m.getName().equals("startTethering")) {
                    if (p.length == 4 && p[0] == int.class && p[1] == ResultReceiver.class && p[2] == boolean.class && p[3] == String.class) {
                        m.invoke(service, 0, callback, false, context.getPackageName()); return true;
                    }
                    if (p.length == 3 && p[0] == int.class && p[1] == ResultReceiver.class && p[2] == boolean.class) {
                        m.invoke(service, 0, callback, false); return true;
                    }
                } else if (!on && m.getName().equals("stopTethering")) {
                    if (p.length == 2 && p[0] == int.class && p[1] == String.class) {
                        m.invoke(service, 0, context.getPackageName()); return true;
                    }
                    if (p.length == 1 && p[0] == int.class) { m.invoke(service, 0); return true; }
                }
            }
        } catch (Exception ignored) { }
        return false;
    }
}
