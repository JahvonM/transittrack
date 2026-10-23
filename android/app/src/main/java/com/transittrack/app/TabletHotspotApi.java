package com.transittrack.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.os.*;
import android.util.Log;
import java.lang.reflect.*;

/** Existing Android-10 OEM path. Never changes global hidden-API policy. */
final class TabletHotspotApi {
    interface Result { void result(boolean ok); }
    static Boolean isOn(Context context) {
        if (Build.VERSION.SDK_INT != 29) return null;
        try {
            WifiManager wifi = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            return (Boolean) WifiManager.class.getDeclaredMethod("isWifiApEnabled").invoke(wifi);
        } catch (Exception ignored) { return null; }
    }
    static String failureCode(Context c) {
        return TabletHotspotStartupService.prefs(c).getString("hotspot_error","HOTSPOT_NOT_CONFIRMED");
    }
    static String classify(Throwable failure) {
        Throwable cause = failure instanceof InvocationTargetException && failure.getCause()!=null ? failure.getCause() : failure;
        if (cause instanceof SecurityException) return "HOTSPOT_ANDROID_PERMISSION_DENIED";
        if (cause instanceof NoSuchFieldException || cause instanceof IllegalAccessException) return "HOTSPOT_API_ACCESS_BLOCKED";
        if (cause instanceof NoSuchMethodException || cause instanceof ClassNotFoundException) return "HOTSPOT_API_UNAVAILABLE";
        return "HOTSPOT_ANDROID_CALL_FAILED";
    }
    private static boolean fail(Context c,String code,Throwable cause) {
        TabletHotspotStartupService.prefs(c).edit().putString("hotspot_error",code).apply();
        // Never log exception messages: OEM exceptions may contain network details.
        Log.w("TransitHotspot",code + (cause==null ? "" : " · " + cause.getClass().getSimpleName()));
        return false;
    }
    static boolean request(Context context, boolean on, Result result) {
        if (Build.VERSION.SDK_INT != 29) return fail(context,"HOTSPOT_ANDROID_VERSION_UNSUPPORTED",null);
        TabletHotspotStartupService.prefs(context).edit().remove("hotspot_error").apply();
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Field field = ConnectivityManager.class.getDeclaredField("mService"); field.setAccessible(true);
            Object service = field.get(cm);
            if (service==null) return fail(context,"HOTSPOT_SERVICE_UNAVAILABLE",null);
            Class<?> contract = Class.forName("android.net.IConnectivityManager");
            return requestOnInterface(context,on,result,service,contract);
        } catch (Exception failure) { return fail(context,classify(failure),failure); }
    }
    /** The contract is public; the concrete generated Binder proxy may be private. */
    static boolean requestOnInterface(Context context,boolean on,Result result,Object service,Class<?> contract) throws ReflectiveOperationException {
        ResultReceiver callback = new ResultReceiver(new Handler(Looper.getMainLooper())) {
            @Override protected void onReceiveResult(int code, Bundle data) {
                if (code!=0) fail(context,"HOTSPOT_ANDROID_RESULT_"+code,null);
                result.result(code == 0);
            }
        };
        for (Method m : contract.getMethods()) {
            Class<?>[] p = m.getParameterTypes();
            if (on && m.getName().equals("startTethering")) {
                if (p.length == 4 && p[0] == int.class && p[1] == ResultReceiver.class && p[2] == boolean.class && p[3] == String.class) {
                    m.invoke(service,0,callback,false,context.getPackageName()); return true;
                }
                if (p.length == 3 && p[0] == int.class && p[1] == ResultReceiver.class && p[2] == boolean.class) {
                    m.invoke(service,0,callback,false); return true;
                }
            } else if (!on && m.getName().equals("stopTethering")) {
                if (p.length == 2 && p[0] == int.class && p[1] == String.class) {
                    m.invoke(service,0,context.getPackageName()); return true;
                }
                if (p.length == 1 && p[0] == int.class) { m.invoke(service,0); return true; }
            }
        }
        return fail(context,"HOTSPOT_API_UNAVAILABLE",null);
    }
}
