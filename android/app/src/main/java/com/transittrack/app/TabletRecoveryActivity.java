package com.transittrack.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Native fallback contains no WebView, cameras or network access. */
public class TabletRecoveryActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean reserved, opening;
    private final Runnable reopen = this::openKiosk;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TabletDisplay.apply(this);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(40, 64, 40, 40);
        panel.setBackgroundColor(Color.rgb(7, 20, 32));
        TextView title = new TextView(this); title.setText("Restoring the kiosk screen");
        title.setTextSize(26); title.setTextColor(Color.WHITE); panel.addView(title);
        TextView text = new TextView(this);
        text.setText("Android closed the app's display. Saved records, recordings and pairing have not been cleared. If this repeats, restart the tablet when parked.");
        text.setTextSize(18); text.setTextColor(Color.LTGRAY); text.setPadding(0, 24, 0, 24); panel.addView(text);
        Button retry = new Button(this); retry.setText("Reopen kiosk");
        retry.setOnClickListener(v -> openKiosk()); panel.addView(retry); setContentView(panel);
    }
    @Override protected void onResume() {
        super.onResume();
        KioskMode.resume(this);
        SharedPreferences p = getSharedPreferences(TabletScreenRecovery.STORE, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis(), start = p.getLong("window", 0);
        int attempts = p.getInt("attempts", 0);
        if (!reserved) {
            if (!ScreenRecoveryPolicy.automatic(now, start, attempts, true)) {
                p.edit().putString("state", "retry_required").apply(); return;
            }
            if (ScreenRecoveryPolicy.newWindow(now, start)) { start = now; attempts = 0; }
            reserved = p.edit().putLong("window", start).putInt("attempts", attempts + 1)
                .putInt("total", Math.min(100000, p.getInt("total", 0) + 1)).putString("state", "waiting").commit();
        }
        if (reserved) handler.postDelayed(reopen, 1500);
    }
    private void openKiosk() {
        if (opening || isFinishing()) return;
        opening = true; handler.removeCallbacks(reopen);
        getSharedPreferences(TabletScreenRecovery.STORE, Context.MODE_PRIVATE).edit().putString("state", "waiting").apply();
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)); finish();
    }
    @Override protected void onPause() { handler.removeCallbacks(reopen); super.onPause(); }
    @Override protected void onDestroy() { handler.removeCallbacks(reopen); super.onDestroy(); }
}
