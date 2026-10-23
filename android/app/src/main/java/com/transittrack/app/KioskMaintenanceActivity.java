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

/** Private native recovery screen. Launchable by verified admin request or seven corner taps. */
public class KioskMaintenanceActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout panel;
    private boolean working, setup, menu;
    private final Runnable expiry = new Runnable() { public void run() {
        if (menu && !setup && KioskMode.enabled(KioskMaintenanceActivity.this) && !KioskMode.maintenance(KioskMaintenanceActivity.this)) {
            showPin();
            KioskMode.resume(KioskMaintenanceActivity.this);
        }
        main.postDelayed(this, 2000);
    }};
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        setup = KioskMode.window(this, "enrollment");
        if (setup) showSetup(); else if (KioskMode.maintenance(this)) showMenu(); else showPin();
        main.postDelayed(expiry, 2000);
    }
    private void page(String title, String message) {
        ScrollView scroll = new ScrollView(this); panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(24 * getResources().getDisplayMetrics().density); panel.setPadding(pad, pad, pad, pad);
        panel.setBackgroundColor(Color.rgb(11, 16, 24)); scroll.addView(panel);
        TextView heading = new TextView(this); heading.setText(title); heading.setTextSize(25); heading.setTextColor(Color.WHITE); panel.addView(heading);
        TextView text = new TextView(this); text.setText(message); text.setTextSize(17); text.setTextColor(Color.LTGRAY); text.setPadding(0, 16, 0, 16); panel.addView(text);
        setContentView(scroll);
    }
    private EditText pin(String hint) {
        EditText field = new EditText(this); field.setHint(hint); field.setTextColor(Color.WHITE); field.setHintTextColor(Color.LTGRAY);
        field.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        field.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(12)});
        field.setSaveEnabled(false); field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO); panel.addView(field); return field;
    }
    private void button(String title, Runnable action) { Button b = new Button(this); b.setText(title); b.setOnClickListener(v -> { if (!working) action.run(); }); panel.addView(b); }
    private void showSetup() {
        page("Set kiosk recovery PIN", "Your administrator requested setup. Choose 8–12 digits and keep them securely. This PIN works offline and is separate from driver sign-in.");
        EditText first = pin("New recovery PIN"), second = pin("Confirm recovery PIN"); TextView result = result();
        button("Save recovery PIN", () -> {
            String a = first.getText().toString(), b = second.getText().toString(); first.setText(""); second.setText("");
            if (!KioskMode.window(this, "enrollment")) { result.setText("Setup expired. Request setup again from Admin."); return; }
            if (!KioskRecoveryPin.valid(a) || !a.equals(b)) { result.setText("Enter matching PINs of 8–12 digits."); return; }
            working = true; result.setText("Saving…");
            worker.execute(() -> {
                boolean saved = false; try { if (KioskMode.window(this, "enrollment")) saved = KioskRecoveryPin.set(this, a); } catch (Exception ignored) { }
                final boolean ok = saved; main.post(() -> { working = false; if (isFinishing() || isDestroyed()) return;
                    if (ok) { setup = false; page("Recovery PIN saved", "Return to the app. Your administrator can now enable permanent kiosk mode."); button("Return to kiosk", () -> KioskMode.endMaintenance(this)); }
                    else result.setText("PIN was not saved. Request setup again if it expired."); });
            });
        });
        button("Cancel", () -> KioskMode.endMaintenance(this));
    }
    private TextView result() { TextView v = new TextView(this); v.setTextColor(Color.rgb(220, 245, 110)); panel.addView(v); return v; }
    private void showPin() {
        if (working) return;
        menu = false;
        page("Kiosk maintenance", KioskRecoveryPin.configured(this) ? "Enter the administrator recovery PIN. Maintenance unlocks Android for up to 10 minutes." : "Ask your administrator to request recovery PIN setup from Tablet controls.");
        if (KioskRecoveryPin.configured(this)) {
            EditText input = pin("Recovery PIN"); TextView result = result();
            button("Unlock maintenance", () -> {
                long remaining = KioskRecoveryPin.remaining(this);
                if (remaining > 0) { result.setText("Try again in " + ((remaining + 999) / 1000) + " seconds."); return; }
                String value = input.getText().toString(); input.setText(""); working = true; result.setText("Checking…");
                worker.execute(() -> {
                    boolean ok = false; try { ok = KioskRecoveryPin.verify(this, value); } catch (Exception ignored) { }
                    final boolean verified = ok; main.post(() -> { working = false; if (isFinishing() || isDestroyed()) return;
                        if (verified && "KIOSK_MAINTENANCE".equals(KioskMode.maintain(this))) showMenu();
                        else result.setText("Unable to unlock. Check the PIN or wait before trying again."); });
                });
            });
        }
        button("Return to kiosk", () -> KioskMode.endMaintenance(this));
    }
    private void showMenu() {
        menu = true;
        page("Administrator maintenance", "Android is unlocked temporarily. Kiosk mode returns automatically within 10 minutes, including if you leave this screen. Rebooting ends maintenance.");
        button("Android settings", () -> { if (KioskMode.maintenance(this)) startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); });
        button("Lock and return to kiosk", () -> KioskMode.endMaintenance(this));
        button("Turn off permanent kiosk mode", () -> {
            if (!KioskMode.maintenance(this)) { showPin(); return; }
            String code = KioskMode.disable(this);
            if ("KIOSK_DISABLED".equals(code)) { page("Kiosk mode is off", "Pairing and saved work are preserved."); button("Open app", () -> KioskMode.endMaintenance(this)); }
            else Toast.makeText(this, "Android could not release kiosk policy. Try the admin controls.", Toast.LENGTH_LONG).show();
        });
    }
    @Override protected void onResume() { super.onResume(); KioskMode.resume(this); }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) KioskMode.resume(this); }
    @Override public void onBackPressed() { KioskMode.endMaintenance(this); }
    @Override protected void onDestroy() { main.removeCallbacksAndMessages(null); worker.shutdownNow(); super.onDestroy(); }
}
