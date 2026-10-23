package com.transittrack.app;

import android.app.Activity;
import android.content.*;
import android.graphics.Color;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Tablet-local kiosk settings. PINs and authorization never cross the WebView bridge. */
public class KioskMaintenanceActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout panel;
    private TextView hotspotStatus;
    private boolean working, setup, menu;
    private long authorizedUntil;
    private boolean authorized() { return SystemClock.elapsedRealtime() < authorizedUntil; }
    private boolean canSetPin() {
        return KioskMode.window(this, "enrollment") || authorized()
            || (!KioskRecoveryPin.configured(this) && !KioskMode.enabled(this));
    }
    private final Runnable expiry = new Runnable() { public void run() {
        if (menu && (!authorized() || (KioskMode.enabled(KioskMaintenanceActivity.this) && !KioskMode.maintenance(KioskMaintenanceActivity.this)))) {
            authorizedUntil = 0; showPin(); KioskMode.resume(KioskMaintenanceActivity.this);
        }
        if (menu && authorized() && hotspotStatus != null) updateHotspotStatus();
        main.postDelayed(this, 1000);
    }};
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT < 26) {
            page("Kiosk settings","Local exit-code setup requires Android 8 or newer.");
            button("Back to app",() -> KioskMode.endMaintenance(this)); return;
        }
        if (KioskMode.window(this, "enrollment") || (!KioskRecoveryPin.configured(this) && !KioskMode.enabled(this))) showSetup();
        else if (KioskMode.maintenance(this)) { authorizedUntil = SystemClock.elapsedRealtime() + 120000; showMenu(); }
        else showPin();
        main.postDelayed(expiry, 1000);
    }
    private void page(String title, String message) {
        hotspotStatus = null;
        ScrollView scroll = new ScrollView(this); panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(24 * getResources().getDisplayMetrics().density); panel.setPadding(pad,pad,pad,pad);
        panel.setBackgroundColor(Color.rgb(11,16,24)); scroll.addView(panel);
        TextView heading = new TextView(this); heading.setText(title); heading.setTextSize(25); heading.setTextColor(Color.WHITE); panel.addView(heading);
        TextView text = new TextView(this); text.setText(message); text.setTextSize(17); text.setTextColor(Color.LTGRAY); text.setPadding(0,16,0,16); panel.addView(text);
        setContentView(scroll);
    }
    private EditText pin(String hint) {
        EditText field = new EditText(this); field.setHint(hint); field.setTextColor(Color.WHITE); field.setHintTextColor(Color.LTGRAY);
        field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        field.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(12)});
        field.setSaveEnabled(false); field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); panel.addView(field); return field;
    }
    private void button(String title,Runnable action) {
        Button b = new Button(this); b.setText(title); b.setAllCaps(false); b.setTextColor(Color.rgb(11,16,24));
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(208,241,92)));
        b.setOnClickListener(v -> { if (!working) action.run(); }); panel.addView(b);
    }
    private TextView result() { TextView v = new TextView(this); v.setTextColor(Color.rgb(220,245,110)); panel.addView(v); return v; }
    private void showSetup() {
        setup = true; menu = false;
        page("Set kiosk exit code", "Choose and confirm 8–12 digits. This code opens kiosk settings and lets you exit. It works offline and is separate from driver sign-in.");
        EditText first = pin("New exit code"), second = pin("Confirm exit code"); TextView result = result();
        button("Save exit code", () -> {
            String a = first.getText().toString(), b = second.getText().toString(); first.setText(""); second.setText("");
            if (!canSetPin()) { result.setText("Enter the current exit code before changing it."); return; }
            if (!KioskRecoveryPin.valid(a) || !a.equals(b)) { result.setText("Enter matching codes of 8–12 digits."); return; }
            working = true; result.setText("Saving…");
            worker.execute(() -> {
                boolean saved = false; try { if (canSetPin()) saved = KioskRecoveryPin.set(this,a); } catch (Exception ignored) { }
                final boolean ok = saved; main.post(() -> {
                    working = false; if (isFinishing() || isDestroyed()) return;
                    if (ok) unlockMenu(); else result.setText("Code could not be saved. Reopen kiosk settings and try again.");
                });
            });
        });
        button("Back to app", () -> KioskMode.endMaintenance(this));
    }
    private void showPin() {
        if (working) return;
        menu = false; setup = false;
        page("Enter kiosk exit code", "Enter your code to open settings or exit kiosk mode. The code works without an internet connection.");
        if (KioskRecoveryPin.configured(this)) {
            EditText input = pin("Exit code"); TextView result = result();
            button("Unlock kiosk settings", () -> {
                long remaining = KioskRecoveryPin.remaining(this);
                if (remaining > 0) { result.setText("Try again in " + ((remaining+999)/1000) + " seconds."); return; }
                String value = input.getText().toString(); input.setText(""); working = true; result.setText("Checking…");
                worker.execute(() -> {
                    boolean ok = false; try { ok = KioskRecoveryPin.verify(this,value); } catch (Exception ignored) { }
                    final boolean verified = ok; main.post(() -> {
                        working = false; if (isFinishing() || isDestroyed()) return;
                        if (verified) unlockMenu(); else result.setText("Incorrect code or temporarily locked. Wait before trying again.");
                    });
                });
            });
        } else result().setText("No exit code is available. Ask an administrator to recover this tablet.");
        button("Back to kiosk", () -> KioskMode.endMaintenance(this));
    }
    private void unlockMenu() {
        setup = false;
        if (KioskMode.enabled(this) && !"KIOSK_MAINTENANCE".equals(KioskMode.maintain(this))) {
            page("Unable to unlock Android", "Android could not release kiosk restrictions. Your saved code and work remain on the tablet.");
            button("Back to kiosk", () -> KioskMode.endMaintenance(this)); return;
        }
        authorizedUntil = SystemClock.elapsedRealtime() + 120000; showMenu();
    }
    private boolean checkAuth() { if (authorized()) return true; showPin(); return false; }
    private void showMenu() {
        menu = true; setup = false;
        boolean active = KioskMode.enabled(this);
        page("Kiosk settings", "Kiosk lock: " + (active ? "temporarily unlocked for settings" : "OFF")
            + "\nDevice management: " + (KioskMode.owner(this) ? "ready" : "not granted by Android")
            + "\nStart kiosk mode to hide Android navigation and notifications. Your exit code protects these settings.");
        TextView feedback = result();
        button("Start kiosk mode", () -> {
            if (!checkAuth()) return;
            String code = KioskMode.enable(this);
            if ("KIOSK_ENABLED".equals(code)) KioskMode.endMaintenance(this);
            else feedback.setText("DEVICE_OWNER_REQUIRED".equals(code) ? "Android device-owner access is required. This tablet has not granted it yet." : "Android could not start kiosk lock: " + code);
        });
        if (active) button("Exit kiosk mode", () -> {
            if (!checkAuth()) return;
            String code = KioskMode.disable(this);
            if ("KIOSK_DISABLED".equals(code)) showMenu(); else feedback.setText("Android could not release kiosk lock. Try again.");
        });
        button("Change exit code", () -> { if (checkAuth()) showSetup(); });
        hotspotSettings(feedback);
        button("Android settings", () -> { if (checkAuth()) startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); });
        button(active ? "Lock and return to kiosk" : "Back to app", () -> KioskMode.endMaintenance(this));
    }
    private void hotspotSettings(TextView feedback) {
        android.content.SharedPreferences network = getSharedPreferences("transittrack_network",MODE_PRIVATE);
        if (!"driver".equals(network.getString("mode",""))) return;
        Switch auto = new Switch(this); auto.setText("Start hotspot automatically"); auto.setTextColor(Color.WHITE);
        auto.setChecked(network.getBoolean("always",false)); panel.addView(auto);
        auto.setOnCheckedChangeListener((button,enabled) -> {
            if (!checkAuth()) return;
            if (!network.edit().putBoolean("always",enabled).putBoolean("enabled",true).commit()) { feedback.setText("Could not save hotspot setting."); return; }
            if (enabled) TabletHotspotStartupService.start(this); else stopService(new Intent(this,TabletHotspotStartupService.class));
            feedback.setText(enabled ? "Hotspot startup saved. Android must allow Modify system settings; actual hotspot state is shown below." : "Automatic startup is off. Current hotspot power is unchanged.");
        });
        hotspotStatus = result(); updateHotspotStatus();
        button("Allow hotspot settings access", () -> {
            if (checkAuth()) startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_WRITE_SETTINGS,android.net.Uri.parse("package:"+getPackageName())));
        });
    }
    private void updateHotspotStatus() {
        if (hotspotStatus == null) return;
        hotspotStatus.setText("Hotspot: " + (Boolean.TRUE.equals(TabletHotspotApi.isOn(this)) ? "ON" : "not confirmed on")
            + " · " + getSharedPreferences("transittrack_network",MODE_PRIVATE).getString("startup_code",""));
    }
    @Override protected void onResume() { super.onResume(); KioskMode.resume(this); if (menu && authorized()) showMenu(); }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) KioskMode.resume(this); }
    @Override public void onBackPressed() { KioskMode.endMaintenance(this); }
    @Override protected void onDestroy() { main.removeCallbacksAndMessages(null); worker.shutdownNow(); super.onDestroy(); }
}
