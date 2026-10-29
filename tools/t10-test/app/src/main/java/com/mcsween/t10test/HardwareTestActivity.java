package com.mcsween.t10test;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.hardware.Camera;
import android.nfc.NfcAdapter;
import android.os.Bundle;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.*;
import java.util.Arrays;

/** Offline hardware probe. No network, card writes, backend or kiosk management. */
@SuppressWarnings("deprecation")
public final class HardwareTestActivity extends Activity implements SurfaceHolder.Callback {
    private NfcAdapter nfc;
    private TextView nfcStatus, cardStatus, cameraStatus;
    private SurfaceView surface;
    private Camera camera;
    private boolean resumed, surfaceReady, wantCamera;
    private int cameraId, taps;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(20, 16, 20, 16);
        setContentView(root);
        TextView title = text(root, "T10 Hardware Test — OFFLINE");
        title.setTextSize(23);
        text(root, "No check-ins are sent. Cards are never written. Card details stay on this screen.");
        nfcStatus = text(root, "Checking NFC…");
        cardStatus = text(root, "Hold a card at the CARD symbol.");
        button(root, "Retry NFC", this::startNfc);
        cameraStatus = text(root, "Camera not started");
        button(root, "Start / next camera", () -> {
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
                return;
            }
            int count = Camera.getNumberOfCameras();
            if (count == 0) { cameraStatus.setText("Android reports no cameras"); return; }
            if (wantCamera) cameraId = (cameraId + 1) % count;
            wantCamera = true;
            openCamera();
        });
        button(root, "Stop camera", () -> { wantCamera = false; closeCamera(); cameraStatus.setText("Camera stopped"); });
        surface = new SurfaceView(this);
        root.addView(surface, new LinearLayout.LayoutParams(-1, 0, 1));
        surface.getHolder().addCallback(this);
        nfc = NfcAdapter.getDefaultAdapter(this);
    }
    private TextView text(LinearLayout root, String value) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(16); root.addView(v); return v;
    }
    private void button(LinearLayout root, String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setOnClickListener(v -> action.run()); root.addView(b);
    }
    private void startNfc() {
        if (!resumed) return;
        if (nfc == null) { nfcStatus.setText("No Android NFC adapter"); return; }
        if (!nfc.isEnabled()) { nfcStatus.setText("NFC is off — enable it in Android Settings"); return; }
        try {
            nfc.disableReaderMode(this);
            nfc.enableReaderMode(this, tag -> runOnUiThread(() -> {
                if (!resumed) return;
                StringBuilder uid = new StringBuilder();
                for (byte b : tag.getId()) uid.append(String.format(java.util.Locale.ROOT, "%02X", b & 255));
                cardStatus.setText("Detected " + (++taps) + " tap(s)\nUID: " + uid + "\n" + Arrays.toString(tag.getTechList()));
            }), NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
                | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V
                | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK, null);
            nfcStatus.setText("NFC reader mode requested — waiting for card");
        } catch (RuntimeException e) { nfcStatus.setText("NFC error: " + e); }
    }
    private void openCamera() {
        closeCamera();
        if (!resumed || !surfaceReady || !wantCamera) return;
        try {
            Camera.CameraInfo info = new Camera.CameraInfo();
            Camera.getCameraInfo(cameraId, info);
            camera = Camera.open(cameraId);
            int degrees = getWindowManager().getDefaultDisplay().getRotation() * 90;
            int rotation = info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT
                ? (360 - (info.orientation + degrees) % 360) % 360
                : (info.orientation - degrees + 360) % 360;
            camera.setDisplayOrientation(rotation);
            camera.setPreviewDisplay(surface.getHolder());
            camera.startPreview();
            cameraStatus.setText("Preview started: camera " + cameraId + " of " + Camera.getNumberOfCameras()
                + ". Confirm whether an image is visible.");
        } catch (Exception e) { closeCamera(); cameraStatus.setText("Camera " + cameraId + " error: " + e); }
    }
    private void closeCamera() {
        if (camera != null) {
            try { camera.stopPreview(); } catch (RuntimeException ignored) { }
            camera.release(); camera = null;
        }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == 1 && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
            wantCamera = true; openCamera();
        } else cameraStatus.setText("Camera permission denied — allow it in Android app settings");
    }
    @Override public void onResume() { super.onResume(); resumed = true; startNfc(); openCamera(); }
    @Override public void onPause() {
        resumed = false;
        if (nfc != null) try { nfc.disableReaderMode(this); } catch (RuntimeException ignored) { }
        closeCamera(); super.onPause();
    }
    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; openCamera(); }
    @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) { }
    @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; closeCamera(); }
}
