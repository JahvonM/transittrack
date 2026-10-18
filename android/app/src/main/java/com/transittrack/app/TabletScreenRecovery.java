package com.transittrack.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import com.getcapacitor.WebViewListener;

/** Keeps confirmed renderer death from leaving a blank screen or a restart loop.
 * Android Home selection handles startup; this never launches an activity in the background.
 */
final class TabletScreenRecovery extends WebViewListener {
    private static final String STORE = "tt_screen_recovery";
    private final MainActivity activity;
    private boolean dead, foreground, queued;
    TabletScreenRecovery(MainActivity activity) { this.activity = activity; }
    private SharedPreferences prefs() { return activity.getSharedPreferences(STORE, Context.MODE_PRIVATE); }
    static JSObject snapshot(Context context) {
        SharedPreferences p = context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        return new JSObject().put("available", true).put("state", p.getString("state", "ready"))
            .put("count", p.getInt("total", 0));
    }
    @Override public void onPageLoaded(WebView view) {
        if (!dead && "waiting".equals(prefs().getString("state", ""))) {
            prefs().edit().putString("state", "recovered").apply();
            TabletDiagnostics.record("system", "SCREEN_RECOVERED");
        }
    }
    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        if (dead) return true;
        dead = true;
        TabletDiagnostics.record("system", "SCREEN_RENDERER_GONE");
        // This specific WebView is unusable. Never clear cookies, WebStorage or saved work.
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.destroy();
        showRecovery();
        if (foreground) recoverAutomatically();
        return true;
    }
    void resumed() { foreground = true; if (dead) recoverAutomatically(); }
    void paused() { foreground = false; }
    private void recoverAutomatically() {
        if (queued || activity.isFinishing() || activity.isDestroyed()) return;
        SharedPreferences p = prefs();
        long now = System.currentTimeMillis(), start = p.getLong("window", 0);
        int attempts = p.getInt("attempts", 0);
        if (!ScreenRecoveryPolicy.automatic(now, start, attempts, foreground)) {
            p.edit().putString("state", "retry_required").apply(); return;
        }
        if (ScreenRecoveryPolicy.newWindow(now, start)) { start = now; attempts = 0; }
        boolean saved = p.edit().putLong("window", start).putInt("attempts", attempts + 1)
            .putInt("total", Math.min(100000, p.getInt("total", 0) + 1)).putString("state", "waiting").commit();
        if (!saved) return; // no durable retry budget: show the native Retry button instead
        queued = true;
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            queued = false;
            if (foreground && !activity.isFinishing() && !activity.isDestroyed()) activity.recreate();
        }, 1500);
    }
    private void showRecovery() {
        LinearLayout panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(40, 64, 40, 40);
        panel.setBackgroundColor(Color.rgb(7, 20, 32));
        TextView title = new TextView(activity);
        title.setText("Restoring the kiosk screen"); title.setTextSize(26); title.setTextColor(Color.WHITE);
        panel.addView(title);
        TextView text = new TextView(activity);
        text.setText("Android closed the app's display. Saved records, recordings and pairing have not been cleared. If this repeats, restart the tablet when parked.");
        text.setTextSize(18); text.setTextColor(Color.LTGRAY); text.setPadding(0, 24, 0, 24); panel.addView(text);
        Button retry = new Button(activity); retry.setText("Reopen kiosk");
        retry.setOnClickListener(v -> { if (!queued) activity.recreate(); }); panel.addView(retry);
        activity.setContentView(panel);
    }
}
