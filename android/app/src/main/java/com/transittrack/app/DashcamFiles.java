package com.transittrack.app;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Only manages its own clips in the app-private, backup-excluded directory. */
public final class DashcamFiles {
    static final long LIMIT = 1024L * 1024 * 1024;
    static final long MIN_FREE = 512L * 1024 * 1024;
    static final long RESERVE = 32L * 1024 * 1024;
    interface Space { long freeBytes(); }
    private final File root;
    // NIO is absent before Android 8/API 26. Resolve it once without linking
    // those classes on older Android; canonical-path checks below still apply.
    private static final Method FILE_TO_PATH;
    private static final Method IS_SYMBOLIC_LINK;
    static {
        Method path = null, link = null;
        try {
            path = File.class.getMethod("toPath");
            link = Class.forName("java.nio.file.Files").getMethod("isSymbolicLink", Class.forName("java.nio.file.Path"));
        } catch (ClassNotFoundException | NoSuchMethodException unavailable) {
            path = null; link = null;
        }
        FILE_TO_PATH = path; IS_SYMBOLIC_LINK = link;
    }
    private static boolean symbolicLink(File file) throws IOException {
        if (IS_SYMBOLIC_LINK == null) return false;
        try { return Boolean.TRUE.equals(IS_SYMBOLIC_LINK.invoke(null, FILE_TO_PATH.invoke(file))); }
        catch (ReflectiveOperationException | RuntimeException error) {
            throw new IOException("Could not verify clip location", error);
        }
    }
    DashcamFiles(File root) throws IOException {
        this.root = root.getCanonicalFile();
        if (!this.root.isDirectory() && !this.root.mkdirs()) throw new IOException("Clip directory unavailable");
    }
    synchronized File find(String name) throws IOException {
        if (name == null || !name.matches("[0-9]{13}-[a-f0-9]{16}(?:-partial|-incomplete|-protected|-incomplete-protected)?\\.mp4"))
            throw new IOException("Invalid clip");
        File file = new File(root, name);
        File canonical = file.getCanonicalFile();
        // File.getCanonicalFile resolves UNIX links, but Windows may only
        // normalize their names. Never accept a link as a recording on NIO hosts.
        if (!root.equals(canonical.getParentFile()) || !file.getAbsoluteFile().equals(canonical) || symbolicLink(file))
            throw new IOException("Invalid clip location");
        return file;
    }
    synchronized List<File> clips() throws IOException {
        File[] entries = root.listFiles();
        List<File> out = new ArrayList<>();
        if (entries != null) for (File entry : entries) {
            try { File file = find(entry.getName()); if (file.isFile()) out.add(file); }
            catch (IOException ignored) { /* Never traverse or delete unrelated paths. */ }
        }
        java.util.Collections.sort(out, (a, b) -> a.getName().compareTo(b.getName()));
        return out;
    }
    static boolean partial(File file) { return file.getName().endsWith("-partial.mp4"); }
    static boolean protectedClip(File file) { return file.getName().endsWith("-protected.mp4"); }
    synchronized long bytes() throws IOException {
        long total = 0; for (File file : clips()) total += file.length(); return total;
    }
    synchronized boolean roomForNext(Space space) throws IOException {
        List<File> files = clips();
        long bytes = 0; for (File f : files) bytes += f.length();
        for (File f : files) {
            if (bytes + RESERVE <= LIMIT && space.freeBytes() >= MIN_FREE + RESERVE) return true;
            if (!partial(f) && !protectedClip(f)) {
                long size = f.length();
                if (!f.delete()) return false;
                bytes -= size;
            }
        }
        return bytes + RESERVE <= LIMIT && space.freeBytes() >= MIN_FREE + RESERVE;
    }
    synchronized File create(long timestamp) throws IOException {
        String name = String.format(java.util.Locale.ROOT, "%013d", timestamp) + "-"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 16) + "-partial.mp4";
        File file = find(name);
        if (!file.createNewFile()) throw new IOException("Clip exists"); return file;
    }
    synchronized File finish(File partial, boolean good, boolean protect) throws IOException {
        File file = find(partial.getName());
        String base = file.getName().replace("-partial.mp4", "");
        File dest = find(base + (good ? "" : "-incomplete") + (protect ? "-protected" : "") + ".mp4");
        if (!file.renameTo(dest)) throw new IOException("Could not finalize clip"); return dest;
    }
    synchronized File protect(String name) throws IOException {
        File file = find(name);
        if (!file.isFile() || partial(file)) throw new IOException("Clip not ready");
        if (protectedClip(file)) return file;
        File dest = find(name.substring(0, name.length() - 4) + "-protected.mp4");
        if (!file.renameTo(dest)) throw new IOException("Could not protect clip"); return dest;
    }
    synchronized void recover() throws IOException {
        for (File file : clips()) if (partial(file)) finish(file, false, true);
    }
    synchronized boolean delete(String name) throws IOException {
        File file = find(name); return !partial(file) && file.isFile() && file.delete();
    }
}
