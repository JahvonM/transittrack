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
    @PluginMethod public void getState(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        out.put("keepScreenOn", true);
        out.put("backgroundTracking", false);
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
    @PluginMethod public void openHomeSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); call.resolve(); }
            catch (RuntimeException error) { call.reject("Open Android Settings > Apps > Default apps > Home app."); }
        });
    }
}
