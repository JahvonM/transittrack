package com.transittrack.app;

import android.Manifest;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** Keep optional Firebase setup failures inside the plugin call, not the process. */
@CapacitorPlugin(
    name = "PushNotifications",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "receive")
)
public class SafePushNotificationsPlugin extends PushNotificationsPlugin {
    @PluginMethod
    public void getRegistrationSupport(PluginCall call) {
        JSObject result = new JSObject();
        int appIdResource = getContext().getResources().getIdentifier(
            "google_app_id", "string", getContext().getPackageName()
        );
        result.put("configured", appIdResource != 0);
        result.put("guarded", true);
        call.resolve(result);
    }

    @Override
    @PluginMethod
    public void register(PluginCall call) {
        try {
            super.register(call);
        } catch (RuntimeException error) {
            call.reject("Android push notifications are not configured or unavailable.", "NATIVE_PUSH_SETUP");
        }
    }

    @Override
    @PluginMethod
    public void unregister(PluginCall call) {
        try {
            super.unregister(call);
        } catch (RuntimeException error) {
            call.reject("Android push notifications are not configured or unavailable.", "NATIVE_PUSH_SETUP");
        }
    }
}
