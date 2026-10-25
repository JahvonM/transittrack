package com.transittrack.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.admin.DevicePolicyManager;
import android.content.Intent;
import android.os.*;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Kiosk settings on the device itself: opened by tapping the top-right
 * corner 5 times (or from the app's tablet settings), protected by the exit
 * code. Laid out like FreeKiosk's settings: a code pad first, then sections
 * (Kiosk, Network, Exit code, Advanced). The exit code and the Wi-Fi
 * password never cross into the web page.
 */
public class KioskMaintenanceActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean working, setup, menu;
    private long authorizedUntil;
    private String tab = "kiosk";
    private TextView countdown, hotspotStatus, busStatus;
    private interface Submit { void run(String code, TextView message); }

    private boolean authorized() { return SystemClock.elapsedRealtime() < authorizedUntil; }
    private boolean canSetPin() {
        return KioskMode.window(this, "enrollment") || authorized()
            || (!KioskRecoveryPin.configured(this) && !KioskMode.enabled(this));
    }
    private final Runnable expiry = new Runnable() { public void run() {
        if (menu && (!authorized() || (KioskMode.enabled(KioskMaintenanceActivity.this) && !KioskMode.maintenance(KioskMaintenanceActivity.this)))) {
            authorizedUntil = 0; showPin(); KioskMode.resume(KioskMaintenanceActivity.this);
        }
        if (menu && authorized()) tick();
        main.postDelayed(this, 1000);
    }};

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        getWindow().setStatusBarColor(KioskUi.INK);
        getWindow().setNavigationBarColor(KioskUi.INK);
        if (Build.VERSION.SDK_INT < 26) {
            message("Kiosk settings", "Kiosk settings on the device need Android 8 or newer.", "Back to app");
            return;
        }
        if (KioskMode.window(this, "enrollment") || (!KioskRecoveryPin.configured(this) && !KioskMode.enabled(this))) showSetup();
        else if (KioskMode.maintenance(this)) { authorizedUntil = SystemClock.elapsedRealtime() + 120000; showMenu(); }
        else showPin();
        main.postDelayed(expiry, 1000);
    }

    // ---------- the code pad ----------

    private void message(String heading, String body, String back) {
        menu = false; setup = false; clearLive();
        LinearLayout page = KioskUi.column(this, 16);
        int pad = KioskUi.dp(this, 32);
        page.setPadding(pad, pad, pad, pad);
        page.setBackgroundColor(KioskUi.INK);
        page.addView(KioskUi.title(this, heading, 30));
        page.addView(KioskUi.text(this, body, 18, KioskUi.SOFT));
        page.addView(KioskUi.button(this, back, KioskUi.Style.PRIMARY, () -> KioskMode.endMaintenance(this)), wrap());
        setContentView(KioskUi.scroll(this, page));
    }

    /** A number pad screen: heading, dots for the digits typed, keys, one action. */
    private void codePad(String heading, String body, String action, String startMessage, Submit submit) {
        menu = false; clearLive();
        final StringBuilder digits = new StringBuilder();
        boolean wide = KioskUi.wide(this);

        LinearLayout words = KioskUi.column(this, 14);
        words.addView(KioskUi.title(this, heading, wide ? 32 : 28));
        words.addView(KioskUi.text(this, body, 18, KioskUi.SOFT));
        LinearLayout dots = KioskUi.row(this, 12);
        dots.setMinimumHeight(KioskUi.dp(this, 28));
        words.addView(dots);
        TextView message = KioskUi.text(this, startMessage == null ? "" : startMessage, 16, KioskUi.BAD);
        message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        words.addView(message);

        Button go = KioskUi.button(this, action, KioskUi.Style.PRIMARY, null);
        Runnable redraw = () -> {
            dots.removeAllViews();
            for (int i = 0; i < Math.max(8, digits.length()); i++) {
                View d = KioskUi.dot(this, i < digits.length() ? KioskUi.TEXT : 0);
                d.setBackground(KioskUi.shape(this, i < digits.length() ? KioskUi.TEXT : 0, 99, i < digits.length() ? 0 : KioskUi.BORDER));
                d.setLayoutParams(new LinearLayout.LayoutParams(KioskUi.dp(this, 16), KioskUi.dp(this, 16)));
                dots.addView(d);
            }
            dots.setContentDescription(digits.length() + " digits entered");
            KioskUi.enable(go, digits.length() >= 8 && !working);
        };
        go.setOnClickListener(v -> {
            if (working || digits.length() < 8) return;
            String code = digits.toString();
            digits.setLength(0); redraw.run();
            submit.run(code, message);
        });

        GridLayout keys = new GridLayout(this);
        keys.setColumnCount(3);
        String[] labels = { "1", "2", "3", "4", "5", "6", "7", "8", "9", "Cancel", "0", "Delete" };
        for (String key : labels) {
            boolean digit = key.length() == 1;
            Button b = KioskUi.button(this, key, digit ? KioskUi.Style.KEY : KioskUi.Style.QUIET, () -> {
                if (working) return;
                if (key.equals("Cancel")) { digits.setLength(0); KioskMode.endMaintenance(this); return; }
                if (key.equals("Delete")) { if (digits.length() > 0) digits.setLength(digits.length() - 1); }
                else if (digits.length() < 12) digits.append(key);
                message.setText("");
                redraw.run();
            });
            if (key.equals("Delete")) b.setContentDescription("Delete last digit");
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED, 1f), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            lp.width = 0; lp.height = KioskUi.dp(this, wide ? 88 : 76);
            int m = KioskUi.dp(this, 6);
            lp.setMargins(m, m, m, m);
            keys.addView(b, lp);
        }
        LinearLayout pad = KioskUi.column(this, 10);
        pad.addView(keys, KioskUi.fill());
        LinearLayout.LayoutParams goParams = KioskUi.fill();
        goParams.setMargins(KioskUi.dp(this, 6), 0, KioskUi.dp(this, 6), 0);
        pad.addView(go, goParams);
        redraw.run();

        LinearLayout page;
        int p = KioskUi.dp(this, wide ? 48 : 20);
        if (wide) {
            page = KioskUi.row(this, 32);
            page.setGravity(Gravity.CENTER);
            page.addView(words, new LinearLayout.LayoutParams(KioskUi.dp(this, 400), ViewGroup.LayoutParams.WRAP_CONTENT));
            page.addView(pad, new LinearLayout.LayoutParams(KioskUi.dp(this, 440), ViewGroup.LayoutParams.WRAP_CONTENT));
        } else {
            page = KioskUi.column(this, 24);
            page.addView(words, KioskUi.fill());
            page.addView(pad, KioskUi.fill());
        }
        page.setPadding(p, p, p, p);
        page.setBackgroundColor(KioskUi.INK);
        setContentView(KioskUi.scroll(this, page));
    }

    private void showSetup() { showSetup(null); }
    private void showSetup(String problem) {
        setup = true;
        codePad("Choose an exit code", "8 to 12 digits. It opens these settings and turns kiosk mode off, even with no internet. It isn't the driver PIN.",
            "Next", problem, (first, message) -> {
                if (!KioskRecoveryPin.valid(first)) { message.setText("Use 8 to 12 digits."); return; }
                codePad("Enter the code again", "Type the same code once more so you know it's right.", "Save exit code", null, (second, again) -> {
                    if (!canSetPin()) { again.setText("Enter the current exit code before changing it."); return; }
                    if (!first.equals(second)) { showSetup("The two codes didn't match. Choose the code again."); return; }
                    working = true; again.setTextColor(KioskUi.SOFT); again.setText("Saving…");
                    worker.execute(() -> {
                        boolean saved = false;
                        try { if (canSetPin()) saved = KioskRecoveryPin.set(this, second); } catch (Exception ignored) { }
                        final boolean ok = saved;
                        main.post(() -> {
                            working = false;
                            if (isFinishing() || isDestroyed()) return;
                            if (ok) unlockMenu(); else { again.setTextColor(KioskUi.BAD); again.setText("The code couldn't be saved. Try again."); }
                        });
                    });
                });
            });
    }

    private void showPin() {
        if (working) return;
        menu = false; setup = false;
        if (!KioskRecoveryPin.configured(this)) {
            message("No exit code is set", "Kiosk settings are locked and no exit code is saved on this device. Ask an administrator to recover it.", "Back to kiosk");
            return;
        }
        long wait = KioskRecoveryPin.remaining(this);
        codePad("Enter the exit code", "The 8 to 12 digit code for this device. It works without internet.", "Open settings",
            wait > 0 ? "Too many wrong tries. Wait " + ((wait + 999) / 1000) + " seconds." : null, (code, message) -> {
                long remaining = KioskRecoveryPin.remaining(this);
                if (remaining > 0) { message.setText("Too many wrong tries. Wait " + ((remaining + 999) / 1000) + " seconds."); return; }
                working = true; message.setTextColor(KioskUi.SOFT); message.setText("Checking…");
                worker.execute(() -> {
                    boolean ok = false;
                    try { ok = KioskRecoveryPin.verify(this, code); } catch (Exception ignored) { }
                    final boolean verified = ok;
                    main.post(() -> {
                        working = false;
                        if (isFinishing() || isDestroyed()) return;
                        if (verified) { unlockMenu(); return; }
                        message.setTextColor(KioskUi.BAD);
                        int failures = KioskMode.prefs(this).getInt("pin_failures", 0);
                        message.setText(failures < 5 ? "Wrong code. " + (5 - failures) + " more " + (5 - failures == 1 ? "try" : "tries") + ", then a wait."
                            : "Wrong code. Wait " + ((KioskRecoveryPin.remaining(this) + 999) / 1000) + " seconds before trying again.");
                    });
                });
            });
    }

    private void unlockMenu() {
        setup = false;
        if (KioskMode.enabled(this) && !"KIOSK_MAINTENANCE".equals(KioskMode.maintain(this))) {
            message("Android didn't unlock", "Android couldn't pause kiosk mode. Your exit code and saved work are still on the device.", "Back to kiosk");
            return;
        }
        authorizedUntil = SystemClock.elapsedRealtime() + 120000; tab = "kiosk"; showMenu();
    }
    private boolean checkAuth() { if (authorized()) return true; showPin(); return false; }

    // ---------- the settings ----------

    private String role() {
        String mode = getSharedPreferences("transittrack_network", MODE_PRIVATE).getString("mode", "");
        return "driver".equals(mode) ? "Driver tablet" : "boarding".equals(mode) ? "Boarding device" : "Kiosk device";
    }
    private boolean driver() { return "driver".equals(getSharedPreferences("transittrack_network", MODE_PRIVATE).getString("mode", "")); }

    private void showMenu() {
        menu = true; setup = false; clearLive();
        boolean wide = KioskUi.wide(this), active = KioskMode.enabled(this);

        LinearLayout header = KioskUi.row(this, 16);
        int hp = KioskUi.dp(this, wide ? 28 : 16);
        header.setPadding(hp, KioskUi.dp(this, 14), hp, KioskUi.dp(this, 14));
        LinearLayout names = KioskUi.column(this, 2);
        names.addView(KioskUi.title(this, "Kiosk settings", 22));
        names.addView(KioskUi.text(this, role(), 14, KioskUi.MUTED));
        header.addView(names, KioskUi.weight(1));
        countdown = KioskUi.text(this, "", 15, KioskUi.MUTED);
        header.addView(countdown);
        header.addView(KioskUi.button(this, active ? (wide ? "Lock and go back" : "Lock") : "Back to app", KioskUi.Style.PRIMARY, () -> KioskMode.endMaintenance(this)));

        LinearLayout content = KioskUi.column(this, 18);
        int cp = KioskUi.dp(this, wide ? 30 : 16);
        content.setPadding(cp, KioskUi.dp(this, wide ? 24 : 16), cp, KioskUi.dp(this, 32));
        switch (tab) {
            case "network": networkTab(content); break;
            case "code": codeTab(content); break;
            case "advanced": advancedTab(content, active); break;
            default: kioskTab(content, active);
        }

        String[][] tabs = { { "kiosk", "Kiosk" }, { "network", "Network" }, { "code", "Exit code" }, { "advanced", "Advanced" } };
        LinearLayout page = KioskUi.column(this, 0);
        page.setBackgroundColor(KioskUi.INK);
        page.addView(header, KioskUi.fill());
        page.addView(KioskUi.line(this));
        if (wide) {
            LinearLayout rail = KioskUi.column(this, 6);
            rail.setPadding(KioskUi.dp(this, 14), KioskUi.dp(this, 20), KioskUi.dp(this, 14), KioskUi.dp(this, 20));
            for (String[] t : tabs) rail.addView(tabButton(t[0], t[1], false), KioskUi.fill());
            TextView about = KioskUi.text(this, "Android " + Build.VERSION.RELEASE + "\nMcSween Kiosk " + version(), 13, KioskUi.MUTED);
            about.setPadding(KioskUi.dp(this, 16), KioskUi.dp(this, 24), 0, 0);
            rail.addView(about);
            LinearLayout body = KioskUi.row(this, 0);
            body.setGravity(Gravity.TOP);
            body.addView(rail, new LinearLayout.LayoutParams(KioskUi.dp(this, 248), ViewGroup.LayoutParams.WRAP_CONTENT));
            View divider = new View(this); divider.setBackgroundColor(KioskUi.LINE);
            body.addView(divider, new LinearLayout.LayoutParams(Math.max(1, KioskUi.dp(this, 1)), ViewGroup.LayoutParams.MATCH_PARENT));
            body.addView(content, KioskUi.weight(1));
            page.addView(body, KioskUi.fill());
        } else {
            LinearLayout chips = KioskUi.row(this, 8);
            chips.setPadding(KioskUi.dp(this, 16), KioskUi.dp(this, 12), KioskUi.dp(this, 16), KioskUi.dp(this, 12));
            for (String[] t : tabs) chips.addView(tabButton(t[0], t[1], true));
            HorizontalScrollView strip = new HorizontalScrollView(this);
            strip.setHorizontalScrollBarEnabled(false);
            strip.addView(chips);
            page.addView(strip, KioskUi.fill());
            page.addView(KioskUi.line(this));
            page.addView(content, KioskUi.fill());
        }
        setContentView(KioskUi.scroll(this, page));
        tick();
    }
    private Button tabButton(String key, String label, boolean chip) {
        boolean on = key.equals(tab);
        Button b = KioskUi.button(this, label, KioskUi.Style.SECONDARY, () -> { if (checkAuth()) { tab = key; showMenu(); } });
        b.setTextColor(on ? (chip ? KioskUi.INK : KioskUi.TEXT) : 0xFFC8DCDA);
        b.setBackground(KioskUi.pressable(this, on ? (chip ? KioskUi.TEAL : KioskUi.SURFACE_HIGH) : 0, chip ? 99 : 12, chip && !on ? KioskUi.BORDER : 0));
        b.setGravity(chip ? Gravity.CENTER : Gravity.CENTER_VERTICAL | Gravity.START);
        b.setMinHeight(KioskUi.dp(this, chip ? 44 : 56));
        b.setMinimumHeight(KioskUi.dp(this, chip ? 44 : 56));
        b.setPadding(KioskUi.dp(this, chip ? 16 : 18), 0, KioskUi.dp(this, chip ? 16 : 18), 0);
        if (on) b.setContentDescription(label + ", selected");
        return b;
    }

    private void kioskTab(LinearLayout content, boolean active) {
        boolean owner = KioskMode.owner(this);
        LinearLayout tiles = KioskUi.panel(this);
        tiles.setOrientation(KioskUi.wide(this) ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
        tiles.addView(tile("Kiosk lock", active ? KioskUi.WARN : KioskUi.MUTED, active ? "Paused while you're here" : "Off"), KioskUi.wide(this) ? KioskUi.weight(1) : KioskUi.fill());
        tiles.addView(tile("Device owner", owner ? KioskUi.GOOD : KioskUi.WARN, owner ? "Ready" : "Not set up"), KioskUi.wide(this) ? KioskUi.weight(1) : KioskUi.fill());
        if (driver()) {
            Boolean on = TabletHotspotApi.isOn(this);
            tiles.addView(tile("Hotspot", Boolean.TRUE.equals(on) ? KioskUi.GOOD : KioskUi.MUTED, Boolean.TRUE.equals(on) ? "On" : "Off"), KioskUi.wide(this) ? KioskUi.weight(1) : KioskUi.fill());
        } else {
            boolean joined = BusHotspot.connected(this);
            tiles.addView(tile("Bus hotspot", joined ? KioskUi.GOOD : KioskUi.MUTED, joined ? "Connected" : BusHotspot.ssid(this).isEmpty() ? "Not saved" : "Not connected"), KioskUi.wide(this) ? KioskUi.weight(1) : KioskUi.fill());
        }
        content.addView(tiles, KioskUi.fill());

        LinearLayout mode = KioskUi.panel(this);
        LinearLayout modeRow = KioskUi.wide(this) ? KioskUi.row(this, 24) : KioskUi.column(this, 16);
        int p = KioskUi.dp(this, 22);
        modeRow.setPadding(p, p, p, p);
        LinearLayout words = KioskUi.column(this, 6);
        words.addView(KioskUi.title(this, "Kiosk mode", 20));
        words.addView(KioskUi.text(this, "Hides Android's buttons and notifications so only this app can be used. To come back here, tap the top-right corner of the screen 5 times and enter the exit code.", 16, KioskUi.SOFT));
        modeRow.addView(words, KioskUi.wide(this) ? KioskUi.weight(1) : KioskUi.fill());
        TextView feedback = KioskUi.text(this, "", 15, KioskUi.BAD);
        if (active) modeRow.addView(KioskUi.button(this, "Turn kiosk mode off", KioskUi.Style.SECONDARY, () -> {
            if (!checkAuth()) return;
            if ("KIOSK_DISABLED".equals(KioskMode.disable(this))) showMenu(); else feedback.setText("Android couldn't turn kiosk mode off. Try again.");
        }));
        else {
            Button start = KioskUi.button(this, "Start kiosk mode", KioskUi.Style.PRIMARY, () -> {
                if (!checkAuth()) return;
                String code = KioskMode.enable(this);
                if ("KIOSK_ENABLED".equals(code)) KioskMode.endMaintenance(this);
                else feedback.setText(startProblem(code));
            });
            modeRow.addView(start);
        }
        mode.addView(modeRow, KioskUi.fill());
        feedback.setPadding(p, 0, p, p / 2);
        mode.addView(feedback, KioskUi.fill());
        content.addView(mode, KioskUi.fill());

        if (!owner) {
            LinearLayout help = KioskUi.panel(this);
            help.setBackground(KioskUi.shape(this, 0xFF2A2410, 16, 0xFF5C4B12));
            TextView t = KioskUi.text(this, "Kiosk mode needs this app to be the device owner. Plug the device into your PC, open Admin → Kiosk tablets in Chrome or Edge, and use Set up a device.", 16, 0xFFF3E3B0);
            t.setPadding(p, p, p, p);
            help.addView(t);
            content.addView(help, KioskUi.fill());
        }

        LinearLayout startPanel = KioskUi.panel(this);
        startPanel.addView(KioskUi.panelHeading(this, "When the device starts"));
        Switch awake = KioskUi.toggle(this, "Keep the screen on", TabletDisplay.enabled(this));
        awake.setOnCheckedChangeListener((b, on) -> { if (checkAuth()) TabletDisplay.save(this, on); });
        startPanel.addView(KioskUi.settingRow(this, "Keep the screen on", "On battery and on the charger.", awake), KioskUi.fill());
        startPanel.addView(KioskUi.line(this));
        TextView reopen = KioskUi.text(this, active && owner ? "Yes" : "No", 17, active && owner ? KioskUi.TEAL : KioskUi.MUTED);
        startPanel.addView(KioskUi.settingRow(this, "Opens by itself after a restart", "Happens while kiosk mode is on.", reopen), KioskUi.fill());
        content.addView(startPanel, KioskUi.fill());
    }
    private LinearLayout tile(String label, int color, String value) {
        LinearLayout t = KioskUi.column(this, 6);
        t.setPadding(KioskUi.dp(this, 22), KioskUi.dp(this, 18), KioskUi.dp(this, 22), KioskUi.dp(this, 18));
        t.addView(KioskUi.text(this, label, 14, KioskUi.MUTED));
        t.addView(KioskUi.status(this, color, value, 18));
        return t;
    }
    private String startProblem(String code) {
        switch (code) {
            case "DEVICE_OWNER_REQUIRED": return "This app isn't the device owner yet. Set it up from Admin → Kiosk tablets → Set up a device.";
            case "KIOSK_RECOVERY_REQUIRED": return "Set an exit code first, in the Exit code section.";
            case "ALREADY_LOCKED": return "Another app is already locking the screen. Turn that off first.";
            case "UNSUPPORTED": return "Kiosk mode needs Android 8 or newer.";
            default: return "Android couldn't start kiosk mode (" + code.toLowerCase(java.util.Locale.US).replace('_', ' ') + ").";
        }
    }

    private void networkTab(LinearLayout content) {
        if (driver()) driverHotspot(content); else busHotspot(content);
        LinearLayout other = KioskUi.panel(this);
        other.addView(KioskUi.panelHeading(this, "Other connections"));
        Button wifi = KioskUi.button(this, "Open", KioskUi.Style.SECONDARY, () -> {
            if (checkAuth()) startActivity(new Intent(android.provider.Settings.ACTION_WIFI_SETTINGS));
        });
        other.addView(KioskUi.settingRow(this, "Android Wi-Fi settings", "Saved networks and Wi-Fi on or off.", wifi), KioskUi.fill());
        content.addView(other, KioskUi.fill());
    }
    private void driverHotspot(LinearLayout content) {
        android.content.SharedPreferences network = getSharedPreferences("transittrack_network", MODE_PRIVATE);
        LinearLayout panel = KioskUi.panel(this);
        int p = KioskUi.dp(this, 22);
        LinearLayout head = KioskUi.column(this, 8);
        head.setPadding(p, p, p, KioskUi.dp(this, 6));
        head.addView(KioskUi.title(this, "This tablet's hotspot", 18));
        hotspotStatus = KioskUi.text(this, "", 16, KioskUi.TEXT);
        head.addView(hotspotStatus);
        panel.addView(head, KioskUi.fill());
        TextView feedback = KioskUi.text(this, "", 15, KioskUi.SOFT);
        Switch auto = KioskUi.toggle(this, "Turn on the hotspot by itself", network.getBoolean("always", false));
        auto.setOnCheckedChangeListener((button, enabled) -> {
            if (!checkAuth()) return;
            if (!network.edit().putBoolean("always", enabled).putBoolean("enabled", true).commit()) { feedback.setText("The setting couldn't be saved."); return; }
            if (enabled) TabletHotspotStartupService.start(this); else stopService(new Intent(this, TabletHotspotStartupService.class));
            feedback.setText(enabled ? "Saved. The hotspot turns on at start and comes back if it goes off." : "Saved. The hotspot stays as it is now.");
            tick();
        });
        panel.addView(KioskUi.settingRow(this, "Turn on the hotspot by itself", "At start, after a restart, and whenever it goes off.", auto), KioskUi.fill());
        panel.addView(KioskUi.line(this));
        Button allow = KioskUi.button(this, "Allow", KioskUi.Style.SECONDARY, () -> {
            if (checkAuth()) startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_WRITE_SETTINGS, android.net.Uri.parse("package:" + getPackageName())));
        });
        boolean canWrite = Build.VERSION.SDK_INT < 23 || android.provider.Settings.System.canWrite(this);
        panel.addView(KioskUi.settingRow(this, "Hotspot control", canWrite ? "Allowed." : "Android needs you to allow \"Modify system settings\" once.", canWrite ? null : allow), KioskUi.fill());
        feedback.setPadding(p, 0, p, p);
        panel.addView(feedback, KioskUi.fill());
        content.addView(panel, KioskUi.fill());
    }
    private void busHotspot(LinearLayout content) {
        LinearLayout panel = KioskUi.panel(this);
        int p = KioskUi.dp(this, 22);
        LinearLayout head = KioskUi.column(this, 8);
        head.setPadding(p, p, p, KioskUi.dp(this, 6));
        head.addView(KioskUi.title(this, "Bus hotspot", 18));
        head.addView(KioskUi.text(this, "The driver tablet's hotspot. Save it once and this device keeps joining it.", 15, KioskUi.SOFT));
        busStatus = KioskUi.text(this, "", 16, KioskUi.TEXT);
        head.addView(busStatus);
        panel.addView(head, KioskUi.fill());

        String saved = BusHotspot.ssid(this), now = BusHotspot.connectedSsid(this);
        EditText name = KioskUi.field(this, "Hotspot name", false);
        name.setText(saved.isEmpty() ? now : saved);
        EditText password = KioskUi.field(this, BusHotspot.hasPassword(this) ? "Saved (type to change)" : "Password", true);
        LinearLayout fields = KioskUi.column(this, 12);
        fields.setPadding(p, KioskUi.dp(this, 10), p, KioskUi.dp(this, 10));
        fields.addView(KioskUi.label(this, "Hotspot name"));
        fields.addView(name, KioskUi.fill());
        fields.addView(KioskUi.label(this, "Password"));
        fields.addView(password, KioskUi.fill());
        panel.addView(fields, KioskUi.fill());

        Switch always = KioskUi.toggle(this, "Always join this hotspot", saved.isEmpty() || BusHotspot.always(this));
        panel.addView(KioskUi.line(this));
        panel.addView(KioskUi.settingRow(this, "Always join this hotspot", "Turns Wi-Fi back on and rejoins whenever the bus is in range.", always), KioskUi.fill());
        TextView feedback = KioskUi.text(this, "", 15, KioskUi.SOFT);
        LinearLayout buttons = KioskUi.row(this, 12);
        buttons.setPadding(p, KioskUi.dp(this, 6), p, KioskUi.dp(this, 6));
        buttons.addView(KioskUi.button(this, "Save hotspot", KioskUi.Style.PRIMARY, () -> {
            if (!checkAuth()) return;
            String code = BusHotspot.save(this, name.getText().toString(), password.getText().toString(), always.isChecked());
            password.setText("");
            if ("BAD_NAME".equals(code)) { feedback.setText("Type the hotspot's name as it shows on the driver tablet."); return; }
            if ("BAD_PASSWORD".equals(code)) { feedback.setText("The password needs 8 to 63 letters, numbers or symbols."); return; }
            if (!"SAVED".equals(code)) { feedback.setText("The hotspot couldn't be saved. Try again."); return; }
            feedback.setText("Saved.");
            reconnect(feedback);
        }));
        buttons.addView(KioskUi.button(this, "Reconnect now", KioskUi.Style.SECONDARY, () -> { if (checkAuth()) reconnect(feedback); }));
        panel.addView(buttons, KioskUi.fill());
        always.setOnCheckedChangeListener((b, on) -> {
            if (!checkAuth() || BusHotspot.ssid(this).isEmpty()) return;
            BusHotspot.setAlways(this, on);
            feedback.setText(on ? "This device will keep joining the bus hotspot." : "It won't join by itself. Android may still use it as a saved network.");
            if (on) reconnect(feedback);
        });
        feedback.setPadding(p, 0, p, p);
        panel.addView(feedback, KioskUi.fill());
        content.addView(panel, KioskUi.fill());
    }
    private void reconnect(TextView feedback) {
        worker.execute(() -> {
            String code = BusHotspot.ensure(this, true);
            main.post(() -> {
                if (isFinishing() || isDestroyed()) return;
                if ("OFF".equals(code)) feedback.setText("Turn on Always join this hotspot first.");
                tick();
            });
        });
    }

    private void codeTab(LinearLayout content) {
        LinearLayout panel = KioskUi.panel(this);
        Button change = KioskUi.button(this, "Change exit code", KioskUi.Style.SECONDARY, () -> { if (checkAuth()) showSetup(); });
        panel.addView(KioskUi.settingRow(this, "Exit code", "8 to 12 digits. Opens these settings and turns kiosk mode off.", change), KioskUi.fill());
        panel.addView(KioskUi.line(this));
        panel.addView(KioskUi.settingRow(this, "How to open these settings", "Tap the top-right corner of the screen 5 times quickly, then enter the exit code.", null), KioskUi.fill());
        panel.addView(KioskUi.line(this));
        panel.addView(KioskUi.settingRow(this, "Wrong codes", "After 5 wrong tries the device waits 30 seconds, then longer each time.", null), KioskUi.fill());
        content.addView(panel, KioskUi.fill());
    }

    private void advancedTab(LinearLayout content, boolean active) {
        boolean owner = KioskMode.owner(this);
        LinearLayout panel = KioskUi.panel(this);
        TextView feedback = KioskUi.text(this, "", 15, KioskUi.BAD);
        Button systemSettings = KioskUi.button(this, "Open", KioskUi.Style.SECONDARY, () -> {
            if (checkAuth()) startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS));
        });
        panel.addView(KioskUi.settingRow(this, "Android settings", "All of Android's settings, while these settings are open.", systemSettings), KioskUi.fill());
        if (owner) {
            panel.addView(KioskUi.line(this));
            Button remove = KioskUi.button(this, "Remove", KioskUi.Style.DANGER, () -> {
                if (!checkAuth()) return;
                new AlertDialog.Builder(this).setTitle("Remove device owner?")
                    .setMessage("Kiosk mode turns off and this app stops managing the device. To get it back, set it up again from Admin with a USB cable.")
                    .setNegativeButton("Keep it", null)
                    .setPositiveButton("Remove", (d, w) -> {
                        if (!checkAuth()) return;
                        if (KioskMode.enabled(this) && !"KIOSK_DISABLED".equals(KioskMode.disable(this))) { feedback.setText("Android couldn't turn kiosk mode off. Try again."); return; }
                        try {
                            DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
                            dpm.clearDeviceOwnerApp(getPackageName());
                            showMenu();
                        } catch (RuntimeException e) { feedback.setText("Android didn't remove it. Try again."); }
                    }).show();
            });
            panel.addView(KioskUi.settingRow(this, "Remove device owner", "Use this before giving the device away or resetting it.", remove), KioskUi.fill());
        }
        feedback.setPadding(KioskUi.dp(this, 22), 0, KioskUi.dp(this, 22), KioskUi.dp(this, 16));
        panel.addView(feedback, KioskUi.fill());
        content.addView(panel, KioskUi.fill());
        if (active) content.addView(KioskUi.text(this, "Kiosk mode is on. It's paused while these settings are open and comes back when you lock.", 15, KioskUi.MUTED));
    }

    // ---------- live bits ----------

    private void clearLive() { countdown = null; hotspotStatus = null; busStatus = null; }
    private void tick() {
        if (countdown != null) countdown.setText("Locks in " + KioskUi.clock((authorizedUntil - SystemClock.elapsedRealtime() + 999) / 1000));
        if (hotspotStatus != null) hotspotStatus.setText(driverHotspotStatus());
        if (busStatus != null) busStatus.setText(BusHotspot.describe(this));
    }
    private String driverHotspotStatus() {
        Boolean on = TabletHotspotApi.isOn(this);
        if (Boolean.TRUE.equals(on)) return "On";
        String code = getSharedPreferences("transittrack_network", MODE_PRIVATE).getString("startup_code", "");
        switch (code) {
            case "HOTSPOT_STARTING": return "Turning on…";
            case "LOW_BATTERY": return "Paused: the battery is low";
            case "HOTSPOT_PERMISSION_REQUIRED": return "Off. Allow hotspot control below.";
            case "HOTSPOT_ANDROID_VERSION_UNSUPPORTED": return "Off. This Android version can't turn it on by itself.";
            case "": return Boolean.FALSE.equals(on) ? "Off" : "Unknown";
            default: return "Off (" + code.toLowerCase(java.util.Locale.US).replace('_', ' ') + ")";
        }
    }
    private String version() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }
    private static LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    @Override protected void onResume() { super.onResume(); KioskMode.resume(this); if (menu && authorized()) showMenu(); }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) KioskMode.resume(this); }
    @Override public void onBackPressed() { KioskMode.endMaintenance(this); }
    @Override protected void onDestroy() { main.removeCallbacksAndMessages(null); worker.shutdownNow(); super.onDestroy(); }
}
