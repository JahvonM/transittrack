package com.transittrack.kioskhelper;

import android.content.Context;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Talks to FreeKiosk's REST API on the same tablet. */
final class Kiosk {
    private Kiosk() {}

    static final String ANNOUNCE_JS =
        "try{localStorage.setItem(\"tt_badge_reader\",\"1\")}catch(e){};"
        + "window.dispatchEvent(new Event(\"tt-badge-reader\"))";

    static boolean screen(Context c, boolean on) {
        return post(c, "/api/screen/" + (on ? "on" : "off"), "{}");
    }

    static boolean announce(Context c) { return js(c, ANNOUNCE_JS); }

    static boolean badge(Context c, String uid) {
        return js(c, ANNOUNCE_JS + ";window.dispatchEvent(new CustomEvent(\"tt-badge\",{detail:\"" + uid + "\"}))");
    }

    static boolean js(Context c, String code) {
        return post(c, "/api/js", "{\"code\":" + quote(code) + "}");
    }

    static boolean post(Context c, String path, String json) {
        HttpURLConnection con = null;
        try {
            URL u = new URL("http://127.0.0.1:" + Config.port(c) + path);
            con = (HttpURLConnection) u.openConnection();
            con.setConnectTimeout(4000);
            con.setReadTimeout(6000);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setRequestProperty("X-Api-Key", Config.apiKey(c));
            con.setRequestProperty("Content-Type", "application/json");
            byte[] body = json.getBytes("UTF-8");
            con.setFixedLengthStreamingMode(body.length);
            OutputStream os = con.getOutputStream();
            os.write(body);
            os.close();
            int code = con.getResponseCode();
            InputStream is = code < 400 ? con.getInputStream() : con.getErrorStream();
            if (is != null) { byte[] b = new byte[512]; while (is.read(b) != -1) { } is.close(); }
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Status.log("FreeKiosk not reachable (" + path + "): " + e.getClass().getSimpleName());
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '"' || ch == '\\') sb.append('\\').append(ch);
            else if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
            else sb.append(ch);
        }
        return sb.append('"').toString();
    }
}
