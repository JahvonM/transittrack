package com.transittrack.app;

import java.util.Locale;
import java.util.regex.Pattern;

/** Restricts auto-confirmation to our own just-requested USB GPS dialog. */
public final class UsbPromptPolicy {
    public static boolean eligible(String packageName, String text, String appLabel,
            String deviceLabel, boolean enabled, long requestedAt, long now) {
        if (!enabled || !"com.android.systemui".equals(packageName) ||
            requestedAt <= 0 || now < requestedAt || now - requestedAt > 45000 ||
            text == null || appLabel == null || appLabel.isEmpty()) return false;
        String lower = text.toLowerCase(Locale.ROOT);
        // The old helper has a similar app name. Its prompts must remain its own.
        if (lower.contains((appLabel + " Helper").toLowerCase(Locale.ROOT))) return false;
        String app = "(?i)(?:allow|open|use)\\s+" + Pattern.quote(appLabel) + "\\s+(?:to\\s+access|for\\b|when\\b)";
        if (!Pattern.compile(app, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE).matcher(text).find()) return false;
        String device = deviceLabel == null ? "" : deviceLabel.trim().toLowerCase(Locale.ROOT);
        // Require the actual receiver name; fall back to an explicit USB label
        // only when Android could not supply a product name.
        return device.isEmpty() ? lower.contains("usb") : lower.contains(device);
    }
}
