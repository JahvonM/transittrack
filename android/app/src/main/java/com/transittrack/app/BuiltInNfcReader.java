package com.transittrack.app;

import android.app.Activity;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Android's integrated reader (including Telpo T10). Reads UIDs, never writes cards. */
final class BuiltInNfcReader implements NfcAdapter.ReaderCallback {
    private final Activity activity;
    private final NfcAdapter adapter;
    private final TapReceipt receipt;
    private final UsbNfcReader.Listener listener;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile boolean running;

    BuiltInNfcReader(Activity activity, NfcAdapter adapter, TapReceipt receipt, UsbNfcReader.Listener listener) {
        this.activity = activity; this.adapter = adapter;
        this.receipt = receipt; this.listener = listener;
    }

    void start() {
        Bundle extras = new Bundle();
        extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
        running = true;
        try {
            adapter.enableReaderMode(activity, this,
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
                | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V
                | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK, extras);
            listener.onStatus("Built-in NFC ready");
        } catch (RuntimeException unavailable) {
            running = false;
            listener.onStatus("Built-in NFC could not start - reopen boarding or retry");
        }
    }

    void stop() {
        running = false;
        receipt.cancel();
        try { adapter.disableReaderMode(activity); } catch (RuntimeException ignored) { }
        worker.shutdownNow();
    }

    @Override public void onTagDiscovered(Tag tag) {
        if (!running || !listener.isReady() || tag == null) return;
        String uid = uid(tag.getId());
        if (uid == null || !busy.compareAndSet(false, true)) return;
        // ReaderCallback runs on a binder thread. Queue on the main thread first,
        // so stop() and submission cannot race when a screen closes.
        activity.runOnUiThread(() -> {
            if (!running || !listener.isReady()) { busy.set(false); return; }
            worker.execute(() -> {
                try { deliver(uid); } finally { busy.set(false); }
            });
        });
    }

    private void deliver(String uid) {
        if (!running || !listener.isReady()) return;
        long at = System.currentTimeMillis();
        String tapId = "native-" + java.util.UUID.randomUUID();
        receipt.begin(tapId, at);
        if (!running || !listener.isReady()) { receipt.cancel(); return; }
        listener.onDelivery("Waiting for app confirmation");
        listener.onTap(uid, tapId, at);
        Boolean accepted = receipt.await(tapId, at + 10000);
        if (accepted == null && running && listener.isReady()) {
            listener.onDelivery("Retrying app confirmation");
            listener.onTap(uid, tapId, at);
            accepted = receipt.await(tapId, at + 30000);
        }
        if (!running) return;
        listener.onDelivery(accepted == null ? "App did not confirm - tap again"
            : accepted ? "Card recognized by app" : "Card rejected by app");
    }

    // Same byte order and framing as the USB reader: existing registered cards match.
    static String uid(byte[] bytes) {
        if (bytes == null || bytes.length < 2 || bytes.length > 16) return null;
        char[] hex = "0123456789ABCDEF".toCharArray();
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            out[i * 2] = hex[(bytes[i] & 0xff) >>> 4];
            out[i * 2 + 1] = hex[bytes[i] & 0xf];
        }
        return new String(out);
    }
}
