package com.transittrack.app;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.SignalStrength;
import android.telephony.TelephonyManager;
import com.getcapacitor.JSObject;

/** Read-only modem status. No phone numbers, SIM identifiers, cell IDs or permission prompts. */
final class TabletCellularHealth {
    static JSObject snapshot(Context context) {
        JSObject out = new JSObject();
        out.put("state", "unknown");
        if (!context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) {
            out.put("state", "unsupported"); return out;
        }
        TelephonyManager modem = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
        if (modem == null) return out;
        try { out.put("state", simState(modem.getSimState())); }
        catch (SecurityException denied) { out.put("state", "permission_denied"); }
        catch (RuntimeException unavailable) { /* firmware may not implement telephony */ }
        try {
            String carrier = modem.getNetworkOperatorName();
            if (carrier == null || carrier.trim().isEmpty()) carrier = modem.getSimOperatorName();
            if (carrier != null) {
                carrier = carrier.replaceAll("[\\p{Cntrl}<>]", "").trim();
                if (!carrier.isEmpty()) out.put("carrier", carrier.substring(0, Math.min(60, carrier.length())));
            }
        } catch (RuntimeException unavailable) { }
        // A cached modem reading, not proof of an Internet connection or a live radio scan.
        if (Build.VERSION.SDK_INT >= 28) try {
            SignalStrength signal = modem.getSignalStrength();
            if (signal != null && "ready".equals(out.optString("state"))) {
                int bars = signal.getLevel();
                if (bars >= 0 && bars <= 4) out.put("bars", bars);
            }
        } catch (RuntimeException unavailable) { }
        return out;
    }
    static String simState(int value) {
        switch (value) {
            case TelephonyManager.SIM_STATE_ABSENT: return "absent";
            case TelephonyManager.SIM_STATE_PIN_REQUIRED: return "pin_required";
            case TelephonyManager.SIM_STATE_PUK_REQUIRED: return "puk_required";
            case TelephonyManager.SIM_STATE_NETWORK_LOCKED: return "network_locked";
            case TelephonyManager.SIM_STATE_READY: return "ready";
            case TelephonyManager.SIM_STATE_NOT_READY: return "not_ready";
            case TelephonyManager.SIM_STATE_PERM_DISABLED: return "disabled";
            case TelephonyManager.SIM_STATE_CARD_IO_ERROR: return "error";
            case TelephonyManager.SIM_STATE_CARD_RESTRICTED: return "restricted";
            default: return "unknown";
        }
    }
}
