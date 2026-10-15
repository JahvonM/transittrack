package com.transittrack.app;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.*;
import android.os.Build;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.security.MessageDigest;
import java.util.*;
import javax.net.ssl.HttpsURLConnection;

/** No credentials persisted; no arbitrary WebView URLs; no uninstall or data clearing. */
final class NativeAppUpdate {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("tt_native_update", Context.MODE_PRIVATE); }
    static long version(PackageInfo p) { return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode; }
    static int flags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    static Set<String> signers(PackageInfo p) throws Exception {
        Signature[] values = Build.VERSION.SDK_INT >= 28 ? (p.signingInfo == null ? null : p.signingInfo.getApkContentsSigners()) : p.signatures;
        Set<String> out = new TreeSet<>();
        if (values != null) for (Signature s : values) out.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
        return out;
    }
    static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder(); for (byte b : bytes) s.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return s.toString();
    }
    static File download(Context c, JSONObject r, long deadline) throws Exception {
        String url = r.getString("url"); long bytes = r.getLong("bytes");
        if (!NativeUpdatePolicy.url(url) || bytes <= 0 || bytes > NativeUpdatePolicy.MAX_BYTES ||
            !"com.transittrack.app".equals(r.getString("package_name")) ||
            !r.getString("sha256").matches("[a-f0-9]{64}")) throw new IOException("UPDATE_INVALID");
        if (c.getFilesDir().getUsableSpace() < bytes * 3 + 50L * 1024 * 1024) throw new IOException("STORAGE_ERROR");
        File file = new File(c.getFilesDir(), "pending-native-update.apk");
        HttpsURLConnection connection = (HttpsURLConnection) new URL(url).openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            if (connection.getResponseCode() != 200) throw new IOException("UPDATE_FAILED");
            long length = connection.getContentLengthLong();
            if (length != -1 && length != bytes) throw new IOException("UPDATE_INVALID");
            MessageDigest digest = MessageDigest.getInstance("SHA-256"); long count = 0;
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
                byte[] chunk = new byte[32768]; int n;
                while ((n = in.read(chunk)) != -1) {
                    count += n;
                    if (count > bytes || SystemClock.elapsedRealtime() >= deadline) throw new IOException("UPDATE_FAILED");
                    digest.update(chunk, 0, n); out.write(chunk, 0, n);
                }
                out.getFD().sync();
            }
            if (!NativeUpdatePolicy.digest(count, bytes, hex(digest.digest()), r.getString("sha256"))) throw new IOException("UPDATE_INVALID");
            PackageManager pm = c.getPackageManager();
            PackageInfo current = pm.getPackageInfo(c.getPackageName(), flags());
            PackageInfo next = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags());
            if (next == null || !NativeUpdatePolicy.candidate(current.packageName, next.packageName, version(current), version(next),
                r.getLong("version_code"), signers(current), signers(next),
                next.applicationInfo == null || (next.applicationInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0))
                throw new IOException("UPDATE_INVALID");
            return file;
        } catch (Exception e) { file.delete(); throw e; }
        finally { connection.disconnect(); }
    }
    static int prepare(Context c, File file) throws Exception {
        PackageInstaller installer = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName()); params.setSize(file.length());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id);
             InputStream in = new FileInputStream(file);
             OutputStream out = session.openWrite("base.apk", 0, file.length())) {
            byte[] bytes = new byte[32768]; int n; while ((n = in.read(bytes)) != -1) out.write(bytes, 0, n);
            session.fsync(out); return id;
        } catch (Exception e) { abandon(c, id); throw e; }
        finally { file.delete(); }
    }
    static void abandon(Context c, int session) { try { c.getPackageManager().getPackageInstaller().abandonSession(session); } catch (RuntimeException ignored) {} }
    static boolean pending(Context c) { return "UPDATE_REQUESTED".equals(prefs(c).getString("code", "")); }
    static String commit(Context c, int sessionId, String id, JSONObject release) {
        try {
            PackageInfo current = c.getPackageManager().getPackageInfo(c.getPackageName(), flags());
            String nonce = UUID.randomUUID().toString();
            if (!prefs(c).edit().putString("id", id).putString("nonce", nonce).putInt("session", sessionId)
                .putLong("version", release.getLong("version_code")).putStringSet("signers", signers(current))
                .putLong("at", System.currentTimeMillis()).putString("code", "UPDATE_REQUESTED").commit()) {
                abandon(c, sessionId); return "STORAGE_ERROR";
            }
            Intent intent = new Intent(c, NativeUpdateReceiver.class).setAction(c.getPackageName() + ".UPDATE_RESULT." + nonce);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent callback = PendingIntent.getBroadcast(c, sessionId, intent, piFlags);
            try (PackageInstaller.Session session = c.getPackageManager().getPackageInstaller().openSession(sessionId)) {
                session.commit(callback.getIntentSender());
            }
            return "UPDATE_REQUESTED";
        } catch (Exception ignored) {
            abandon(c, sessionId); prefs(c).edit().putString("code", "UPDATE_FAILED").commit(); return "UPDATE_FAILED";
        }
    }
    static void reconcile(Context c, ControlReceiptLedger ledger) {
        SharedPreferences p = prefs(c);
        String id = p.getString("id", ""), code = p.getString("code", "");
        if (!TabletControlPolicy.id(id)) return;
        if ("UPDATE_REQUESTED".equals(code)) {
            try {
                PackageInfo installed = c.getPackageManager().getPackageInfo(c.getPackageName(), flags());
                if (version(installed) == p.getLong("version", -1) && !signers(installed).isEmpty() &&
                    signers(installed).equals(p.getStringSet("signers", Collections.emptySet()))) code = "UPDATE_INSTALLED";
                else if (System.currentTimeMillis() - p.getLong("at", Long.MAX_VALUE) > 600000) {
                    abandon(c, p.getInt("session", -1)); code = "INTERRUPTED";
                }
            } catch (Exception ignored) { /* keep unknown rather than claiming success */ }
            if (!code.equals(p.getString("code", ""))) p.edit().putString("code", code).commit();
        }
        if (!code.equals(ledger.receipt(id))) ledger.complete(id, code);
    }
}
