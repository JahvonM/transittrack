package com.transittrack.app;

/**
 * Hands one card tap to the boarding screen and waits for its answer. Shared by the
 * USB reader (ACR122U) and the device's own NFC (e.g. the Telpo T10 validator), so
 * both behave the same: a fresh tap ID, one retry, and no answer never counts as yes.
 * The tap ID never contains the card UID.
 */
final class TapDelivery {
    interface Sink {
        void onTap(String uid, String tapId, long at);
        void onDelivery(String message);
    }
    interface Running { boolean get(); }
    enum Result { CANCELLED, UNCONFIRMED, ACCEPTED, REJECTED }

    static final long FIRST_WAIT_MS = 10000, LAST_WAIT_MS = 30000;

    private TapDelivery() { }

    static Result deliver(TapReceipt results, Sink sink, String uid, long at, Running running) {
        String tapId = "native-" + java.util.UUID.randomUUID().toString();
        results.begin(tapId, at);
        if (!running.get()) { results.cancel(); return Result.CANCELLED; }
        sink.onDelivery("Waiting for app confirmation");
        sink.onTap(uid, tapId, at);
        Boolean ok = results.await(tapId, at + FIRST_WAIT_MS);
        if (ok == null && running.get()) {
            sink.onDelivery("Retrying app confirmation");
            sink.onTap(uid, tapId, at);
            ok = results.await(tapId, at + LAST_WAIT_MS);
        }
        if (!running.get()) return Result.CANCELLED;
        if (ok == null) { sink.onDelivery("App did not confirm - tap again"); return Result.UNCONFIRMED; }
        sink.onDelivery(ok ? "Card recognized by app" : "Card rejected by app");
        return ok ? Result.ACCEPTED : Result.REJECTED;
    }

    /** Card UID bytes as the app stores them: uppercase hex, no separators, 2-16 bytes. */
    static String uid(byte[] id) {
        if (id == null || id.length < 2 || id.length > 16) return null;
        StringBuilder sb = new StringBuilder(id.length * 2);
        for (byte x : id) sb.append(String.format("%02X", x & 0xFF));
        return sb.toString();
    }
}
