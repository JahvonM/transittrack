package com.transittrack.app;

import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;
import java.security.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Offline admin recovery only. Never a driver PIN, never exposed to JavaScript or telemetry. */
final class KioskRecoveryPin {
    static boolean valid(String pin) { return pin != null && pin.matches("[0-9]{8,12}"); }
    static byte[] derive(String pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt, 150000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        finally { spec.clearPassword(); }
    }
    static boolean configured(Context c) { return KioskMode.prefs(c).contains("pin_hash") && KioskMode.prefs(c).contains("pin_salt"); }
    static boolean set(Context c, String pin) throws Exception {
        if (!valid(pin)) return false;
        byte[] salt = new byte[32]; new SecureRandom().nextBytes(salt);
        return KioskMode.prefs(c).edit().putString("pin_hash", Base64.encodeToString(derive(pin, salt), Base64.NO_WRAP))
            .putString("pin_salt", Base64.encodeToString(salt, Base64.NO_WRAP)).putInt("pin_failures", 0)
            .remove("pin_until_wall").remove("pin_until_elapsed").remove("enrollment_elapsed").commit();
    }
    static long delay(int failures) { return failures < 5 ? 0 : Math.min(900000L, 30000L << Math.min(5, (failures - 5) / 5)); }
    static long remaining(Context c) {
        android.content.SharedPreferences p = KioskMode.prefs(c);
        long penalty = delay(p.getInt("pin_failures", 0));
        if (penalty == 0) return 0;
        // A reboot or clock change cannot erase a lockout. Begin its bounded penalty again after boot.
        if (p.getInt("pin_failure_boot", -2) != KioskMode.boot(c)) {
            p.edit().putInt("pin_failure_boot", KioskMode.boot(c)).putLong("pin_until_wall", System.currentTimeMillis() + penalty)
                .putLong("pin_until_elapsed", SystemClock.elapsedRealtime() + penalty).commit();
        }
        return Math.min(penalty, Math.max(0, Math.max(p.getLong("pin_until_wall", 0) - System.currentTimeMillis(),
            p.getLong("pin_until_elapsed", 0) - SystemClock.elapsedRealtime())));
    }
    static boolean verify(Context c, String pin) throws Exception {
        if (!configured(c) || remaining(c) > 0) return false;
        android.content.SharedPreferences p = KioskMode.prefs(c);
        boolean ok = valid(pin) && MessageDigest.isEqual(derive(pin, Base64.decode(p.getString("pin_salt", ""), Base64.NO_WRAP)),
            Base64.decode(p.getString("pin_hash", ""), Base64.NO_WRAP));
        if (ok) return p.edit().putInt("pin_failures", 0).remove("pin_until_wall").remove("pin_until_elapsed").commit();
        int failures = Math.min(100, p.getInt("pin_failures", 0) + 1); long penalty = delay(failures);
        p.edit().putInt("pin_failures", failures).putInt("pin_failure_boot", KioskMode.boot(c))
            .putLong("pin_until_wall", System.currentTimeMillis() + penalty).putLong("pin_until_elapsed", SystemClock.elapsedRealtime() + penalty).commit();
        return false;
    }
}
