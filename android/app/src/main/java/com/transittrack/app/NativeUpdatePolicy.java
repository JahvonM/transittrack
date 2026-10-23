package com.transittrack.app;
import java.net.URI;
import java.util.Set;
final class NativeUpdatePolicy {
    static final long MAX_BYTES = 150L * 1024 * 1024;
    static boolean url(String value) {
        try {
            URI u = new URI(value);
            return "https".equals(u.getScheme()) && "app.mcsweenstransport.com".equals(u.getHost()) &&
                u.getPort() == -1 && u.getUserInfo() == null && u.getQuery() == null && u.getFragment() == null &&
                u.getRawPath().matches("/native-releases/[a-zA-Z0-9_-]+\\.apk");
        } catch (Exception e) { return false; }
    }
    static boolean candidate(String currentPackage, String nextPackage, long installed, long candidate, long expected,
                             Set<String> currentSigners, Set<String> nextSigners, boolean debug) {
        return "com.transittrack.app".equals(currentPackage) && currentPackage.equals(nextPackage) &&
            candidate > installed && candidate == expected && expected <= Integer.MAX_VALUE &&
            !debug && currentSigners != null && !currentSigners.isEmpty() && currentSigners.equals(nextSigners);
    }
    static boolean digest(long size, long expectedSize, String actual, String expected) {
        return size > 0 && size <= MAX_BYTES && size == expectedSize && expected != null &&
            expected.matches("[a-f0-9]{64}") && expected.equals(actual);
    }
}
