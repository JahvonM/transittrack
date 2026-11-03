package com.transittrack.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Reads card UIDs with the device's own NFC, e.g. the Telpo T10 bus validator, while the
 * boarding screen is open and in front. Android reader mode keeps other apps (and the
 * "no app for this tag" popup) away from the card while it is on. Taps go through the
 * same TapDelivery flow as the USB reader. Only the kiosk app declares the NFC permission;
 * without it this reports itself as unavailable.
 */
final class BuiltInNfcReader {
    static final int FLAGS = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
        | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V
        | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;
    /** The same card lifted and put straight back within this time is one tap. */
    static final long REPEAT_MS = 1500;

    interface Listener extends TapDelivery.Sink { boolean isReady(); }

    private final NfcAdapter adapter;
    private final Listener listener;
    private final TapReceipt results = new TapReceipt();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean on, busy;
    private volatile String lastUid;
    private volatile long lastAt;

    BuiltInNfcReader(Context context, Listener listener) {
        this.listener = listener;
        NfcAdapter found = null;
        if (context.checkCallingOrSelfPermission(Manifest.permission.NFC) == PackageManager.PERMISSION_GRANTED) {
            try { found = NfcAdapter.getDefaultAdapter(context); } catch (RuntimeException ignored) { }
        }
        adapter = found;
    }

    boolean available() { return adapter != null; }
    boolean nfcSwitchedOn() {
        try { return adapter != null && adapter.isEnabled(); } catch (RuntimeException e) { return false; }
    }
    boolean isOn() { return on; }

    /** Call on the UI thread while the activity is resumed. */
    boolean start(Activity activity) {
        if (on) return true;
        if (adapter == null || activity == null || !nfcSwitchedOn()) return false;
        Bundle extras = new Bundle();
        extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
        try {
            adapter.enableReaderMode(activity, this::onTag, FLAGS, extras);
            on = true;
        } catch (RuntimeException e) {
            on = false;  // activity not resumed, or NFC service unavailable
        }
        return on;
    }

    /** Call on the UI thread. Safe to call when already stopped. */
    void stop(Activity activity) {
        boolean was = on;
        on = false;
        results.cancel();
        if (!was || adapter == null || activity == null) return;
        try { adapter.disableReaderMode(activity); } catch (RuntimeException ignored) { }
    }

    boolean acknowledge(String tapId, boolean accepted, long now) {
        return results.acknowledge(tapId, accepted, now);
    }

    void shutdown() { on = false; results.cancel(); worker.shutdownNow(); }

    // Binder thread. Reader mode reports each card once per arrival; while one tap waits
    // for the boarding screen's answer, others are ignored, like the USB reader.
    private void onTag(Tag tag) {
        if (!on || busy || tag == null || !listener.isReady()) return;
        String uid = TapDelivery.uid(tag.getId());
        if (uid == null) return;
        if (uid.equals(lastUid) && System.currentTimeMillis() - lastAt < REPEAT_MS) return;
        busy = true;
        try {
            worker.execute(() -> {
                try {
                    TapDelivery.deliver(results, listener, uid, System.currentTimeMillis(),
                        () -> on && listener.isReady());
                } finally {
                    lastUid = uid; lastAt = System.currentTimeMillis(); busy = false;
                }
            });
        } catch (RejectedExecutionException e) {
            busy = false;
        }
    }
}
