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
        // Remote support consent must always be a human decision, even while USB is reconnecting.
        if (lower.contains("screen") || lower.contains("record") || lower.contains("camera") ||
            lower.contains("microphone") || lower.contains("cast") || lower.contains("display")) return false;
        // The old helper has a similar app name. Its prompts must remain its own.
        if (lower.contains((appLabel + " Helper").toLowerCase(Locale.ROOT))) return false;
        String app = "(?i)(?:allow|open|use)\\s+" + Pattern.quote(appLabel) + "\\s+(?:to\\s+access|for\\b|when\\b)";
        if (!Pattern.compile(app, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE).matcher(text).find()) return false;
        String device = deviceLabel == null ? "" : deviceLabel.trim().toLowerCase(Locale.ROOT);
        // Require the actual receiver name; fall back to an explicit USB label
        // only when Android could not supply a product name.
        return device.isEmpty() ? lower.contains("usb") : lower.contains(device);
    }

    /** Android's own popup when the ACR122U card reader is plugged in or found at start-up:
     *  "Open <app> to handle ACR122U PICC Interface?". The Helper answered it too. Only this
     *  app, only that reader, never screen/camera/audio consent. */
    public static boolean readerAttachPrompt(String packageName, String text, String appLabel) {
        if (!"com.android.systemui".equals(packageName) || text == null || appLabel == null || appLabel.isEmpty()) return false;
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("screen") || lower.contains("record") || lower.contains("camera") ||
            lower.contains("microphone") || lower.contains("cast") || lower.contains("display") || lower.contains("audio")) return false;
        if (lower.contains((appLabel + " Helper").toLowerCase(Locale.ROOT))) return false;
        if (!lower.contains("acr122")) return false;
        String app = "(?i)\\bopen\\s+" + Pattern.quote(appLabel) + "\\s+to\\s+handle\\b";
        return Pattern.compile(app, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE).matcher(text).find();
    }
}
