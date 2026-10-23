package com.transittrack.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Optional Home selection uses Android UI; never takes over the launcher silently. */
@CapacitorPlugin(name = "TabletRecovery")
public class TabletRecoveryPlugin extends Plugin {
    @PluginMethod public void openKioskSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(getActivity(),KioskMaintenanceActivity.class)); call.resolve(); }
            catch (RuntimeException e) { call.reject("Could not open kiosk settings."); }
        });
    }
    @PluginMethod public void setFullscreen(PluginCall call) {
        boolean enabled = true; // Page cleanup must not expose system bars in the dedicated kiosk APK.
        if (!getContext().getSharedPreferences("tablet_display", android.content.Context.MODE_PRIVATE).edit().putBoolean("fullscreen", enabled).commit()) { call.reject("Could not save fullscreen preference."); return; }
        getActivity().runOnUiThread(() -> {
            android.view.View decor = getActivity().getWindow().getDecorView();
            decor.setSystemUiVisibility(enabled
                ? android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                  | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                  | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                : android.view.View.SYSTEM_UI_FLAG_VISIBLE);
            if (enabled) KioskMode.immersive(getActivity());
            call.resolve();
        });
    }
    @PluginMethod public void getState(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        out.put("keepScreenOn", TabletDisplay.enabled(getContext()));
        out.put("screenControl", true);
        out.put("localKioskSettings", true);
        out.put("backgroundTracking", DriverLocationService.active());
        out.put("screenRecovery", TabletScreenRecovery.snapshot(getContext()));
        boolean home = false;
        try {
            Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo resolved = getContext().getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            home = resolved != null && resolved.activityInfo != null &&
                getContext().getPackageName().equals(resolved.activityInfo.packageName);
        } catch (RuntimeException ignored) { }
        out.put("defaultHome", home);
        out.put("startup", home ? "Android Home app selected" : "Open Android Home settings to choose startup behaviour");
        call.resolve(out);
    }
    @PluginMethod public void setKeepScreenOn(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Choose on or off."); return; }
        getActivity().runOnUiThread(() -> {
            if (!TabletDisplay.save(getContext(), enabled)) { call.reject("Could not save the display setting."); return; }
            TabletDisplay.apply(getActivity());
            JSObject out = new JSObject(); out.put("keepScreenOn", enabled); call.resolve(out);
        });
    }
    @PluginMethod public void openHomeSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); call.resolve(); }
            catch (RuntimeException error) { call.reject("Open Android Settings > Apps > Default apps > Home app."); }
        });
    }
}
