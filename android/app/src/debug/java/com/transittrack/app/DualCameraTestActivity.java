package com.transittrack.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.hardware.Camera;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Debug-only, locally started, two visible previews. No recorder, audio, files,
 * network, service, boot receiver or remote command path.
 */
@SuppressWarnings("deprecation")
public final class DualCameraTestActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final HandlerThread thread = new HandlerThread("TT-DualCameraTest");
    private Handler worker;
    private final SurfaceHolder[] holders = new SurfaceHolder[2];
    private final boolean[] surfacesReady = new boolean[2];
    private final Camera[] cameras = new Camera[2]; // Worker owns cameras.
    private final AtomicLong[] frames = {new AtomicLong(), new AtomicLong()};
    private final AtomicLong[] lastFrame = {new AtomicLong(), new AtomicLong()};
    private final AtomicBoolean stopped = new AtomicBoolean(false);
    private TextView status;
    private Button startButton;
    private volatile boolean running;
    private long started;
    private final Runnable tickTask = this::tick;
    private final Runnable deadline = () -> stopTest("Test timed out. Cameras are being released.");

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        thread.start(); worker = new Handler(thread.getLooper());
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(20, 16, 20, 16);
        layout.setBackgroundColor(Color.rgb(8, 20, 32));
        TextView title = label("Front + rear camera test", 23);
        layout.addView(title);
        status = label("Park safely. Close Admin live viewing first.\n"
                + "This test shows both cameras for 10 seconds at 640 × 480.\n"
                + "No video or audio is saved or sent.", 16);
        layout.addView(status);
        LinearLayout previews = new LinearLayout(this);
        previews.setOrientation(LinearLayout.HORIZONTAL);
        layout.addView(previews, new LinearLayout.LayoutParams(-1, 0, 1));
        String[] names = {"FRONT — inside bus", "REAR — road"};
        for (int i = 0; i < 2; i++) {
            final int index = i;
            LinearLayout column = new LinearLayout(this);
            column.setOrientation(LinearLayout.VERTICAL);
            previews.addView(column, new LinearLayout.LayoutParams(0, -1, 1));
            column.addView(label(names[i], 15));
            SurfaceView preview = new SurfaceView(this);
            holders[i] = preview.getHolder();
            holders[i].addCallback(new SurfaceHolder.Callback() {
                @Override public void surfaceCreated(SurfaceHolder holder) {
                    surfacesReady[index] = true; updateStart();
                }
                @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int height) {}
                @Override public void surfaceDestroyed(SurfaceHolder holder) {
                    surfacesReady[index] = false;
                    if (running) stopTest("Test stopped: preview surface closed.");
                    updateStart();
                }
            });
            column.addView(preview, new LinearLayout.LayoutParams(-1, 0, 1));
        }
        startButton = new Button(this);
        startButton.setText("Start 10-second test");
        startButton.setOnClickListener(v -> {
            if (android.os.Build.VERSION.SDK_INT >= 23
                    && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, 42);
            } else beginTest();
        });
        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        layout.addView(buttons);
        buttons.addView(startButton, new LinearLayout.LayoutParams(0, -2, 1));
        Button close = new Button(this);
        close.setText("Stop and return to kiosk");
        close.setOnClickListener(v -> { stopTest("Stopped by operator."); finish(); });
        buttons.addView(close, new LinearLayout.LayoutParams(0, -2, 1));
        setContentView(layout); updateStart();
    }

    private TextView label(String text, int size) {
        TextView v = new TextView(this);
        v.setText(text); v.setTextColor(Color.WHITE); v.setTextSize(size);
        v.setPadding(0, 6, 0, 6); return v;
    }
    private void updateStart() {
        if (startButton != null)
            startButton.setEnabled(surfacesReady[0] && surfacesReady[1] && !running && !stopped.get());
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != 42) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) beginTest();
        else status.setText("Camera permission was denied. Nothing was captured.");
    }
    private void beginTest() {
        if (running || stopped.get() || !surfacesReady[0] || !surfacesReady[1]
                || isFinishing() || !hasWindowFocus()) return;
        running = true; updateStart();
        status.setText("Opening both cameras. Both previews must keep moving.");
        main.postDelayed(deadline, 20_000);
        worker.post(() -> {
            try {
                int front = -1, rear = -1;
                for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
                    Camera.CameraInfo info = new Camera.CameraInfo(); Camera.getCameraInfo(i, info);
                    if (info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT && front < 0) front = i;
                    if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK && rear < 0) rear = i;
                }
                if (front < 0 || rear < 0) {
                    complete(false, "Front and rear cameras were not both available."); return;
                }
                openPreview(front, 0); openPreview(rear, 1);
                if (stopped.get()) { releaseCameras(); return; }
                for (int i = 0; i < 2; i++) { frames[i].set(0); lastFrame[i].set(0); }
                started = SystemClock.elapsedRealtime();
                worker.postDelayed(tickTask, 1_000);
            } catch (Exception e) {
                complete(false, "Could not open both previews together. Close other camera users and retry."
                        + "\nThis alone does not prove dual recording is unsupported.");
            }
        });
    }
    private void openPreview(int id, int index) throws Exception {
        if (stopped.get()) return;
        Camera camera = Camera.open(id);
        cameras[index] = camera;
        if (stopped.get()) { releaseCameras(); return; }
        camera.setErrorCallback((code, c) -> complete(false,
                "Camera driver reported an error while both cameras were open."));
        Camera.Parameters p = camera.getParameters();
        boolean supported = false;
        for (Camera.Size size : p.getSupportedPreviewSizes())
            if (size.width == 640 && size.height == 480) supported = true;
        if (!supported) throw new IllegalStateException("480p unavailable");
        p.setPreviewSize(640, 480); p.setPreviewFormat(ImageFormat.NV21);
        for (int[] range : p.getSupportedPreviewFpsRange()) {
            if (range[0] == 15_000 && range[1] == 15_000) {
                p.setPreviewFpsRange(range[0], range[1]); break;
            }
        }
        camera.setParameters(p);
        Camera.CameraInfo info = new Camera.CameraInfo(); Camera.getCameraInfo(id, info);
        int degrees = getWindowManager().getDefaultDisplay().getRotation() * 90;
        int orientation = info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT
                ? (360 - (info.orientation + degrees) % 360) % 360
                : (info.orientation - degrees + 360) % 360;
        camera.setDisplayOrientation(orientation);
        camera.setPreviewDisplay(holders[index]);
        int bufferBytes = 640 * 480 * ImageFormat.getBitsPerPixel(ImageFormat.NV21) / 8;
        camera.setPreviewCallbackWithBuffer((bytes, source) -> {
            if (stopped.get()) return;
            frames[index].incrementAndGet();
            lastFrame[index].set(SystemClock.elapsedRealtime());
            // Recycle immediately; never inspect, retain, record or transmit image bytes.
            try { source.addCallbackBuffer(bytes); }
            catch (RuntimeException e) { complete(false, "Preview buffer delivery failed."); }
        });
        for (int i = 0; i < 3; i++) camera.addCallbackBuffer(new byte[bufferBytes]);
        camera.startPreview();
    }
    private void tick() {
        if (stopped.get()) return;
        long now = SystemClock.elapsedRealtime(), elapsed = now - started;
        long front = frames[0].get(), rear = frames[1].get();
        if (elapsed >= 2_000 && (!DualCameraProbeWindow.fresh(lastFrame[0].get(), now)
                || !DualCameraProbeWindow.fresh(lastFrame[1].get(), now))) {
            complete(false, "One or both previews stopped producing frames."); return;
        }
        if (elapsed >= DualCameraProbeWindow.DURATION_MS) {
            boolean pass = DualCameraProbeWindow.passed(started, now, front, rear,
                    lastFrame[0].get(), lastFrame[1].get(), false);
            complete(pass, pass ? "Both cameras delivered frames together at 640 × 480."
                    : "Not enough fresh frames from both cameras."); return;
        }
        main.post(() -> {
            if (!stopped.get()) status.setText("Testing: " + elapsed / 1000 + "/10 seconds\n"
                    + "Front frames: " + front + " · Rear frames: " + rear);
        });
        worker.postDelayed(tickTask, 1_000);
    }
    private void complete(boolean pass, String message) {
        if (!stopped.compareAndSet(false, true)) return;
        releaseCameras();
        showResult((pass ? "PREVIEW TEST PASSED\n" : "TEST NOT PASSED\n") + message
                + "\nFront frames: " + frames[0].get() + " · Rear frames: " + frames[1].get()
                + "\nCameras released. Nothing saved or uploaded."
                + (pass ? "\nSimultaneous recording and heat/storage endurance are still untested." : ""));
    }
    private void stopTest(String message) {
        if (!running || !stopped.compareAndSet(false, true)) return;
        worker.post(() -> { releaseCameras(); showResult(message + "\nNo recording was created."); });
    }
    private void showResult(String text) {
        main.removeCallbacks(deadline);
        main.post(() -> {
            running = false;
            if (!isFinishing() && !isDestroyed()) { status.setText(text); updateStart(); }
        });
    }
    private void releaseCameras() {
        worker.removeCallbacks(tickTask);
        for (int i = 0; i < cameras.length; i++) {
            Camera c = cameras[i]; cameras[i] = null;
            if (c == null) continue;
            try { c.setPreviewCallbackWithBuffer(null); c.setErrorCallback(null); } catch (Exception ignored) {}
            try { c.stopPreview(); } catch (Exception ignored) {}
            try { c.release(); } catch (Exception ignored) {}
        }
    }
    @Override protected void onPause() { stopTest("Test stopped: screen left."); super.onPause(); }
    @Override protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        stopped.set(true);
        worker.post(() -> { releaseCameras(); thread.quitSafely(); });
        super.onDestroy();
    }
}
