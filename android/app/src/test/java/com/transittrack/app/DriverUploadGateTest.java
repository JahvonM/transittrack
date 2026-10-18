package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class DriverUploadGateTest {
 @Test public void pageAndNativeCannotUploadTogether(){
  DriverUploadGate g=new DriverUploadGate();assertTrue(g.pageBegin("one",100));assertFalse(g.nativeBegin(101));
  g.pageEnd("one");assertTrue(g.nativeBegin(102));assertFalse(g.pageBegin("two",103));g.nativeEnd();assertTrue(g.pageBegin("two",104));
 }
 @Test public void deadWebViewLeaseExpiresAndOldCallbackCannotReleaseNewLease(){
  DriverUploadGate g=new DriverUploadGate();assertTrue(g.pageBegin("old",100));assertTrue(g.pageBegin("new",20100));
  g.pageEnd("old");assertFalse(g.nativeBegin(20101));g.pageEnd("new");assertTrue(g.nativeBegin(20102));
 }
}
