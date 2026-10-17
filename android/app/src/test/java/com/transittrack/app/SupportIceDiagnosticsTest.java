package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class SupportIceDiagnosticsTest {
 @Test public void countsOnlyCandidateTypes() {
  String sdp="v=0\r\na=ice-pwd:private-value\r\na=candidate:1 1 udp 1 192.0.2.1 5000 typ host\r\n"
   +"a=candidate:2 1 udp 1 192.0.2.2 5001 typ srflx raddr 192.0.2.1 rport 5000\r\n"
   +"a=candidate:3 1 udp 1 203.0.113.1 49199 typ relay raddr 192.0.2.2 rport 5001\r\n";
  assertEquals("H1/S1/R1",SupportIceDiagnostics.counts(sdp));
 }
 @Test public void neverEchoesUntrustedOrCredentialText() {
  assertEquals("H0/S0/R0",SupportIceDiagnostics.counts("token=private-secret\na=ice-pwd:sensitive"));
  assertEquals("H0/S0/R0",SupportIceDiagnostics.counts(null));
  assertEquals("H0/S0/R0",SupportIceDiagnostics.counts("x".repeat(65537)));
 }
 @Test public void acceptsOnlyBoundedNumericErrors() {
  assertEquals(701,SupportIceDiagnostics.safeError(701));
  assertEquals(401,SupportIceDiagnostics.safeError(401));
  assertEquals(0,SupportIceDiagnostics.safeError(-1));
  assertEquals(0,SupportIceDiagnostics.safeError(Integer.MAX_VALUE));
 }
}
