package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class NativeUpdatePolicyTest {
    Set<String> cert(String v) { return new HashSet<>(Arrays.asList(v)); }
    @Test public void acceptsOnlyOwnHttpsReleasePath() {
        assertTrue(NativeUpdatePolicy.url("https://app.mcsweenstransport.com/native-releases/kiosk_2.apk"));
        for (String s : Arrays.asList("http://app.mcsweenstransport.com/native-releases/a.apk",
            "https://evil.test/native-releases/a.apk", "https://user@app.mcsweenstransport.com/native-releases/a.apk",
            "https://app.mcsweenstransport.com:443/native-releases/a.apk",
            "https://app.mcsweenstransport.com/native-releases/a.apk?key=secret",
            "https://app.mcsweenstransport.com/native-releases/%2e%2e/helper.apk",
            "https://eager-transit-track-go.base44.app/native-releases/a.apk",
            "file:///data/local/a.apk")) assertFalse(s, NativeUpdatePolicy.url(s));
    }
    @Test public void rejectsHelperPackageWrongKeyDowngradeDebugAndMissingSignature() {
        assertTrue(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",1,2,2,cert("old"),cert("old"),false));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.helper",1,2,2,cert("old"),cert("old"),false));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",1,2,2,cert("old"),cert("new"),false));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",2,1,1,cert("old"),cert("old"),false));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",2,2,2,cert("old"),cert("old"),false));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",1,3,2,cert("old"),cert("old"),false));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",1,2,2,cert("old"),cert("old"),true));
        assertFalse(NativeUpdatePolicy.candidate("com.transittrack.app","com.transittrack.app",1,2,2,Collections.emptySet(),Collections.emptySet(),false));
    }
    @Test public void requiresExactLengthAndSha256WithinBound() {
        String h = String.join("", Collections.nCopies(64,"a"));
        assertTrue(NativeUpdatePolicy.digest(100,100,h,h));
        assertFalse(NativeUpdatePolicy.digest(99,100,h,h));
        assertFalse(NativeUpdatePolicy.digest(101,100,h,h));
        assertFalse(NativeUpdatePolicy.digest(0,0,h,h));
        assertFalse(NativeUpdatePolicy.digest(NativeUpdatePolicy.MAX_BYTES+1,NativeUpdatePolicy.MAX_BYTES+1,h,h));
        assertFalse(NativeUpdatePolicy.digest(100,100,h,h.replace('a','b')));
    }
}
