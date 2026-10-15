package com.transittrack.app;

import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.Toast;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** WebView supplies only an ID and existing device key. Actions come from fixed HTTPS server. */
@CapacitorPlugin(name = "TabletControl")
public class TabletControlPlugin extends Plugin {
    private static final String ENDPOINT = "https://eager-transit-track-go.base44.app/api/apps/6a98b192be27b5f9635020ba/functions/tabletControl";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private ControlReceiptLedger ledger;
    private final AtomicBoolean executing = new AtomicBoolean(false);
    private volatile boolean safe = false;
    private volatile String safeDevice = "";
    private volatile long safetyAt = 0;
    private volatile long interactionAt = SystemClock.elapsedRealtime();
    private final Runnable expiry = new Runnable() { public void run() {
        checkLease(); main.postDelayed(this, 1000);
    }};
    @Override public void load() {
        prefs = getContext().getSharedPreferences("tt_tablet_control", Context.MODE_PRIVATE);
        ledger = new ControlReceiptLedger(new ControlReceiptLedger.Store() {
            public Map<String,String> read() {
                Map<String,String> rows = new java.util.LinkedHashMap<>();
                for (Map.Entry<String, ?> item : prefs.getAll().entrySet()) if (item.getKey().startsWith("receipt.")) rows.put(item.getKey().substring(8), String.valueOf(item.getValue()));
                return rows;
            }
            public boolean commit(Map<String,String> rows) {
                SharedPreferences.Editor edit = prefs.edit();
                for (String key : prefs.getAll().keySet()) if (key.startsWith("receipt.") && !rows.containsKey(key.substring(8))) edit.remove(key);
                for (Map.Entry<String,String> item : rows.entrySet()) edit.putString("receipt." + item.getKey(), item.getValue());
                return edit.commit();
            }
        });
        main.post(expiry);
    }
    @Override protected void handleOnDestroy() {
        main.removeCallbacks(expiry); worker.shutdownNow();
        super.handleOnDestroy();
    }
    @Override protected void handleOnPause() { safe = false; safetyAt = 0; super.handleOnPause(); }
    @Override protected void handleOnResume() { checkLease(); super.handleOnResume(); }
    void noteInteraction() { interactionAt = SystemClock.elapsedRealtime(); safe = false; }
    @PluginMethod public void setWorkSafety(PluginCall call) {
        safe = Boolean.TRUE.equals(call.getBoolean("safe", false));
        safeDevice = call.getString("device_id", "");
        safetyAt = SystemClock.elapsedRealtime();
        call.resolve();
    }
    private DevicePolicyManager policy() { return (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE); }
    private ComponentName admin() { return new ComponentName(getContext(), TransitDeviceAdminReceiver.class); }
    private boolean owner() { DevicePolicyManager d = policy(); return d != null && d.isDeviceOwnerApp(getContext().getPackageName()); }
    private boolean locked() {
        ActivityManager a = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        return a != null && (Build.VERSION.SDK_INT >= 23 ? a.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE : a.isInLockTaskMode());
    }
    @PluginMethod public void getState(PluginCall call) {
        main.post(() -> {
            checkLease();
            JSObject out = new JSObject();
            out.put("available", true); out.put("deviceOwner", owner());
            out.put("locked", locked()); out.put("temporaryLock", prefs.getBoolean("lease", false));
            out.put("leaseSeconds", Math.max(0, (prefs.getLong("leaseElapsed", 0) - SystemClock.elapsedRealtime()) / 1000));
            out.put("rebootSupported", Build.VERSION.SDK_INT >= 24);
            out.put("lastCode", prefs.getString("lastCode", ""));
            call.resolve(out);
        });
    }
    private boolean releaseLease() {
        try { if (prefs.getBoolean("lease", false) && locked()) getActivity().stopLockTask(); }
        catch (RuntimeException ignored) { /* native policy removal is the independent fallback */ }
        return TabletLockRecovery.release(getContext()) && !locked();
    }
    private void checkLease() {
        if (prefs != null && TabletLockRecovery.due(getContext())) releaseLease();
    }
    private String perform(String action, long leaseMs, String device, long deadline) {
        if (SystemClock.elapsedRealtime() >= deadline) return "EXPIRED";
        if (getActivity().isFinishing() || getActivity().isDestroyed() || !getActivity().hasWindowFocus()) return "APP_NOT_VISIBLE";
        if (!owner()) return "DEVICE_OWNER_REQUIRED";
        try {
            if ("release".equals(action)) return prefs.getBoolean("lease", false) ? (releaseLease() ? "RELEASED" : "ANDROID_ERROR") : "NO_LOCK";
            if ("lock_test".equals(action)) {
                if (Build.VERSION.SDK_INT < 23) return "UNSUPPORTED";
                if (locked() || prefs.getBoolean("lease", false) || policy().isLockTaskPermitted(getContext().getPackageName())) return "ALREADY_LOCKED";
                if (!TabletLockRecovery.canSchedule(getContext())) return "RECOVERY_UNAVAILABLE";
                long now = SystemClock.elapsedRealtime();
                String[] previous = policy().getLockTaskPackages(admin());
                JSONArray old = new JSONArray();
                java.util.LinkedHashSet<String> allowed = new java.util.LinkedHashSet<>();
                for (String p : previous) { old.put(p); allowed.add(p); }
                allowed.add(getContext().getPackageName());
                // Recovery lease persisted before modifying Android policy.
                if (!prefs.edit().putBoolean("lease", true).putString("previousPackages", old.toString())
                    .putLong("leaseStartedElapsed", now).putLong("leaseElapsed", now + leaseMs)
                    .putLong("leaseWall", System.currentTimeMillis() + leaseMs).commit()) return "STORAGE_ERROR";
                TabletLockRecovery.schedule(getContext(), now + leaseMs);
                policy().setLockTaskPackages(admin(), allowed.toArray(new String[0]));
                getActivity().startLockTask();
                if (!locked()) { releaseLease(); return "ANDROID_ERROR"; }
                Toast.makeText(getContext(), "Admin kiosk lock test: releases automatically within 10 minutes", Toast.LENGTH_LONG).show();
                return "LOCKED";
            }
            if (Build.VERSION.SDK_INT < 24) return "UNSUPPORTED";
            long lastReboot = ledger.lastRebootAt();
            if (lastReboot > 0 && System.currentTimeMillis() - lastReboot < 120000) return "CONTROL_COOLDOWN";
            if (!device.equals(safeDevice) || !TabletControlPolicy.rebootSafe(safe, safetyAt, interactionAt, SystemClock.elapsedRealtime())) return "TABLET_BUSY";
            // Persist the requested outcome BEFORE reboot. If process exits immediately,
            // next heartbeat can forward this receipt without repeating the side effect.
            if (!saveReceipt(activeId, "REBOOT_REQUESTED")) return "STORAGE_ERROR";
            policy().reboot(admin());
            return "REBOOT_REQUESTED";
        } catch (RuntimeException ignored) {
            if ("lock_test".equals(action)) releaseLease();
            return "ANDROID_ERROR";
        }
    }
    private String activeDevice = "";
    private String activeId = ""; // worker serialises executions; UI is joined before next task
    private boolean reserve(String id) { return ledger.reserve(id, activeDevice, System.currentTimeMillis()); }
    private String receipt(String id) { return ledger.receipt(id); }
    private boolean saveReceipt(String id, String code) {
        boolean saved = ledger.complete(id, code);
        if (saved) prefs.edit().putString("lastCode", code).apply();
        return saved;
    }
    @PluginMethod public void pendingReceipts(PluginCall call) {
        JSArray ids = new JSArray();
        for (String id : ledger.pending(call.getString("device_id", ""), System.currentTimeMillis())) ids.put(id);
        JSObject out = new JSObject(); out.put("ids", ids); call.resolve(out);
    }
    private void reported(String id) { ledger.reported(id); }
    private static final class ControlDenied extends java.io.IOException {
        final int status; ControlDenied(int status) { super("CONTROL_DENIED"); this.status = status; }
    }
    private JSONObject post(JSONObject body) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(ENDPOINT).openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            connection.setRequestProperty("X-App-Id", "6a98b192be27b5f9635020ba");
            connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            if (connection.getResponseCode() != 200) throw new ControlDenied(connection.getResponseCode());
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[1024]; int n;
                while ((n = in.read(chunk)) != -1) { if (out.size() + n > 16384) throw new java.io.IOException("CONTROL_SIZE"); out.write(chunk, 0, n); }
                return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally { connection.disconnect(); }
    }
    @PluginMethod public void execute(PluginCall call) {
        final String device = call.getString("device_id", ""), token = call.getString("device_token", ""), id = call.getString("command_id", "");
        if (!device.matches("[A-Za-z0-9_-]{6,64}") || !TabletControlPolicy.token(token) || !TabletControlPolicy.id(id)) {
            call.reject("Secure device pairing and command ID required."); return;
        }
        if (!executing.compareAndSet(false, true)) { call.reject("Tablet control is already being checked."); return; }
        worker.execute(() -> {
            String code = receipt(id);
            try {
                JSONObject request = new JSONObject().put("device_id", device).put("device_token", token).put("command_id", id);
                if (code == null) {
                    long started = SystemClock.elapsedRealtime();
                    JSONObject proof = post(new JSONObject(request.toString()).put("operation", "claim"));
                    String action = proof.optString("action");
                    long ttl = proof.optLong("ttl_ms", 0), lease = proof.optLong("lease_ms", 0);
                    if (!TabletControlPolicy.proof(proof.optString("id"), id, action, ttl, lease)) throw new java.io.IOException("INVALID_PROOF");
                    long deadline = started + ttl;
                    long remainingLease = Math.max(0, lease - (SystemClock.elapsedRealtime() - started));
                    activeDevice = device;
                    if (!reserve(id)) { call.reject("Tablet cannot persist a command receipt."); return; }
                    activeId = id;
                    final String[] result = { "INTERRUPTED" };
                    CountDownLatch done = new CountDownLatch(1);
                    main.post(() -> { try { result[0] = perform(action, remainingLease, device, deadline); } finally { done.countDown(); } });
                    // No timed-out UI runnable can execute later: keep worker joined until UI finishes.
                    done.await();
                    code = result[0];
                    if (!saveReceipt(id, code)) code = "INTERRUPTED";
                }
                boolean reported = false;
                try { post(new JSONObject(request.toString()).put("operation", "result").put("code", code)); reported = true; reported(id);
                } catch (ControlDenied denied) { if (denied.status == 409 || denied.status == 410) reported(id); }
                catch (Exception ignored) { }
                JSObject out = new JSObject(); out.put("code", code); out.put("reported", reported); call.resolve(out);
            } catch (Exception ignored) {
                // Fixed message only: never log credentials, server bodies or exceptions.
                call.reject("Command could not be verified. No unverified action was started.");
            } finally { executing.set(false); }
        });
    }
}
