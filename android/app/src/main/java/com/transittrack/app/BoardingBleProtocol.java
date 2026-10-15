package com.transittrack.app;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/** Bounded, synchronized transport policy; no persisted codes or phone addresses. */
final class BoardingBleProtocol {
    static final int MAX_CODE = 200;
    private static final class Pending {
        final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        final long at;
        Pending(long at) { this.at = at; }
    }
    private final Map<String, Pending> pending = new HashMap<>();
    private final Map<String, Long> phones = new HashMap<>();
    private final ArrayDeque<Long> attempts = new ArrayDeque<>();

    static String code(byte[] bytes) {
        if (bytes == null || bytes.length <= 8 || bytes.length > MAX_CODE) return null;
        for (byte b : bytes) if (b < 0x21 || b > 0x7e) return null;
        String text = new String(bytes, StandardCharsets.US_ASCII);
        return text.startsWith("tt-code:") ? text : null;
    }
    static String name(String name) {
        String s = name == null ? "" : name.replaceAll("[^A-Za-z0-9 ._-]", "").trim();
        if (s.isEmpty()) s = "TransitTrack bus";
        return s.substring(0, Math.min(24, s.length())).trim();
    }
    // Includes malformed complete messages, so junk does not bypass the budget.
    synchronized boolean reserve(String phone, long now) {
        while (!attempts.isEmpty() && now - attempts.peekFirst() >= 60000) attempts.removeFirst();
        phones.entrySet().removeIf(e -> now - e.getValue() >= 60000);
        Long last = phones.get(phone);
        if (attempts.size() >= 20 || (last != null && now - last < 3000)) return false;
        phones.put(phone, now);
        attempts.addLast(now);
        return true;
    }
    synchronized boolean append(String phone, int offset, byte[] bytes, long now) {
        pending.entrySet().removeIf(e -> now - e.getValue().at >= 10000);
        Pending item = pending.get(phone);
        if (bytes == null || bytes.length == 0 || offset < 0 ||
            (item == null && (offset != 0 || pending.size() >= 8)) ||
            (item != null && offset != item.bytes.size()) ||
            (item == null ? 0 : item.bytes.size()) + bytes.length > MAX_CODE) {
            pending.remove(phone);
            return false;
        }
        if (item == null) { item = new Pending(now); pending.put(phone, item); }
        item.bytes.write(bytes, 0, bytes.length);
        return true;
    }
    synchronized byte[] execute(String phone, boolean execute, long now) {
        Pending item = pending.remove(phone);
        return execute && item != null && now - item.at < 10000 ? item.bytes.toByteArray() : null;
    }
    synchronized void disconnect(String phone) { pending.remove(phone); }
    synchronized void clearPending() { pending.clear(); }
}
