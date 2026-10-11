package com.transittrack.kioskhelper;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * The tablet PIN for the Wi-Fi and data screen (Helper 1.11). The setup tool
 * hands over the tablet's FreeKiosk exit PIN (--es net_pin); only a salted hash
 * is kept. Five wrong tries lock the screen for 5 minutes. Works offline - the
 * screen matters most when the tablet has lost its connection.
 */
final class NetPin {
    private NetPin() {}

    private static final int MAX_TRIES = 5;
    private static final long LOCK_MS = 5 * 60 * 1000;
    private static final int ROUNDS = 10000;

    static boolean isSet(Context c) {
        return !Config.prefs(c).getString("net_pin_hash", "").isEmpty();
    }

    static void set(Context c, String pin) {
        if (pin == null || !pin.matches("[0-9]{4,12}")) return;
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String s = hex(salt);
        String h = hash(s, pin);
        if (h.isEmpty()) return;
        Config.prefs(c).edit()
                .putString("net_pin_salt", s)
                .putString("net_pin_hash", h)
                .putInt("net_pin_fails", 0)
                .putLong("net_pin_locked_until", 0)
                .apply();
    }

    /** How long the screen stays locked after too many wrong PINs (0 = not locked). */
    static long lockedForMs(Context c) {
        long left = Config.prefs(c).getLong("net_pin_locked_until", 0) - System.currentTimeMillis();
        return left > 0 ? left : 0;
    }

    static boolean check(Context c, String pin) {
        if (pin == null || !pin.matches("[0-9]{1,12}") || !isSet(c) || lockedForMs(c) > 0) return false;
        SharedPreferences p = Config.prefs(c);
        String want = p.getString("net_pin_hash", "");
        String got = hash(p.getString("net_pin_salt", ""), pin);
        boolean ok = !got.isEmpty() && MessageDigest.isEqual(
                got.getBytes(StandardCharsets.US_ASCII), want.getBytes(StandardCharsets.US_ASCII));
        SharedPreferences.Editor e = p.edit();
        if (ok) {
            e.putInt("net_pin_fails", 0).apply();
            return true;
        }
        int fails = p.getInt("net_pin_fails", 0) + 1;
        if (fails >= MAX_TRIES) {
            e.putInt("net_pin_fails", 0).putLong("net_pin_locked_until", System.currentTimeMillis() + LOCK_MS);
            Status.log("Wi-Fi and data screen: too many wrong PINs, locked for 5 minutes");
        } else {
            e.putInt("net_pin_fails", fails);
        }
        e.apply();
        return false;
    }

    private static String hash(String salt, String pin) {
        try {
            PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt.getBytes(StandardCharsets.US_ASCII), ROUNDS, 256);
            return hex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA1").generateSecret(spec).getEncoded());
        } catch (Exception e) {
            return "";
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }
}
