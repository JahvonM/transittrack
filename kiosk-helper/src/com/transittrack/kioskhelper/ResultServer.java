package com.transittrack.kioskhelper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Local commands from the TransitTrack page (127.0.0.1 only):
 *   /result?ok=1|0  the boarding page reports a card accepted/rejected
 *   /rescan-usb     look for the USB GPS / card reader again now
 */
final class ResultServer implements Runnable {
    private final Runnable onRescan;

    ResultServer(Runnable onRescan) { this.onRescan = onRescan; }

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
                if ("GET".equals(method) && path.startsWith("/result")) {
                    boolean ok = path.contains("ok=1");
                    synchronized (lock) { result = ok; lock.notifyAll(); }
                } else if ("GET".equals(method) && path.startsWith("/rescan-usb") && onRescan != null) {
                    onRescan.run();
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
