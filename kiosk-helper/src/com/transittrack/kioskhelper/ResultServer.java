package com.transittrack.kioskhelper;

import android.util.Base64;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;

/**
 * Local commands from the TransitTrack page (127.0.0.1 only):
 *   /result?ok=1|0  the boarding page reports a card accepted/rejected
 *   /rescan-usb     look for the USB GPS / card reader again now
 * Helper 1.9, sent by Admin -> Kiosk tablets through the page (need ?k=KEY):
 *   /wifi/scan?id=..             boarding tablet: list the Wi-Fi networks around it
 *   /wifi/join?id=..&ssid=..&pass=..  boarding tablet: switch to a chosen network
 *   /hotspot?id=..&always=1|0    driver tablet: keep the hotspot on all the time (or not)
 * KEY is random for each helper start and only ever given to the page FreeKiosk
 * shows (window.__ttHelperKey, with the health report), so nothing else on the
 * tablet can change its Wi-Fi.
 */
final class ResultServer implements Runnable {
    interface Commands { void run(String route, Map<String, String> query); }

    static final String KEY = newKey();

    private static String newKey() {
        byte[] b = new byte[24];
        new SecureRandom().nextBytes(b);
        return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private final Runnable onRescan;
    private final Commands commands;

    ResultServer(Runnable onRescan, Commands commands) { this.onRescan = onRescan; this.commands = commands; }

    private final Object lock = new Object();
    private Boolean result;
    private volatile boolean running = true;
    private ServerSocket server;

    void arm() { synchronized (lock) { result = null; } }

    Boolean await(long ms) {
        long end = System.currentTimeMillis() + ms;
        synchronized (lock) {
            while (result == null) {
                long left = end - System.currentTimeMillis();
                if (left <= 0) break;
                try { lock.wait(left); } catch (InterruptedException e) { break; }
            }
            return result;
        }
    }

    static Map<String, String> query(String q) {
        Map<String, String> out = new HashMap<>();
        if (q == null || q.isEmpty()) return out;
        for (String part : q.split("&")) {
            int eq = part.indexOf('=');
            String k = eq < 0 ? part : part.substring(0, eq);
            String v = eq < 0 ? "" : part.substring(eq + 1);
            try {
                out.put(URLDecoder.decode(k, "UTF-8"), URLDecoder.decode(v, "UTF-8"));
            } catch (Exception ignored) { /* skip a malformed pair */ }
        }
        return out;
    }

    static boolean keyMatches(String given) {
        if (given == null) return false;
        try {
            return MessageDigest.isEqual(given.getBytes("UTF-8"), KEY.getBytes("UTF-8"));
        } catch (Exception e) {
            return false;
        }
    }

    @Override public void run() {
        try {
            server = new ServerSocket(8765, 10, InetAddress.getByName("127.0.0.1"));
        } catch (IOException e) {
            Status.log("Result listener not started: " + e.getMessage());
            return;
        }
        while (running) {
            try (Socket s = server.accept()) {
                s.setSoTimeout(3000);
                BufferedReader r = new BufferedReader(new InputStreamReader(s.getInputStream(), "UTF-8"));
                String line = r.readLine();
                if (line == null) continue;
                String[] parts = line.split(" ");
                String method = parts[0];
                String path = parts.length > 1 ? parts[1] : "/";
                String h;
                while ((h = r.readLine()) != null && h.length() > 0) { }
                if (path.length() > 2048) path = "/";
                int qi = path.indexOf('?');
                String route = qi < 0 ? path : path.substring(0, qi);
                if ("GET".equals(method) && path.startsWith("/result")) {
                    boolean ok = path.contains("ok=1");
                    synchronized (lock) { result = ok; lock.notifyAll(); }
                } else if ("GET".equals(method) && path.startsWith("/rescan-usb") && onRescan != null) {
                    onRescan.run();
                } else if ("GET".equals(method) && commands != null
                        && ("/wifi/scan".equals(route) || "/wifi/join".equals(route) || "/hotspot".equals(route))) {
                    Map<String, String> q = query(qi < 0 ? "" : path.substring(qi + 1));
                    if (keyMatches(q.get("k"))) commands.run(route, q);
                    else Status.log("Ignored a network command without the page key");
                }
                OutputStream os = s.getOutputStream();
                os.write(("HTTP/1.1 204 No Content\r\n"
                        + "Access-Control-Allow-Origin: *\r\n"
                        + "Access-Control-Allow-Private-Network: true\r\n"
                        + "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                        + "Connection: close\r\n\r\n").getBytes("US-ASCII"));
                os.flush();
            } catch (IOException e) {
                if (!running) break;
            }
        }
    }

    void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (IOException ignored) { }
    }
}
