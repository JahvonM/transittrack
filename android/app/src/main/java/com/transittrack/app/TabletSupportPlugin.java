package com.transittrack.app;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Capability reporting only. No capture, permission prompts or remote ports.
 * Capture endpoints stay absent until authenticated session validation exists.
 */
@CapacitorPlugin(name = "TabletSupport")
public class TabletSupportPlugin extends Plugin {
    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        boolean front = false, back = false;
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            if (manager != null) for (String id : manager.getCameraIdList()) {
                Integer facing = manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
                front |= facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT;
                back |= facing != null && facing == CameraCharacteristics.LENS_FACING_BACK;
            }
        } catch (Exception ignored) { result.put("cameraEnumeration", "unavailable"); }
        DevicePolicyManager policy = (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        result.put("androidApi", Build.VERSION.SDK_INT);
        result.put("frontCamera", front);
        result.put("backCamera", back);
        result.put("cameraPermissionGranted", getContext().checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
        result.put("deviceOwner", policy != null && policy.isDeviceOwnerApp(getContext().getPackageName()));
        result.put("screenConsentRequired", true);
        result.put("remoteViewingReady", false);
        result.put("reason", "Session authentication and streaming integration not installed");
        call.resolve(result);
    }
}
