package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class GpsBackupPolicyTest {
 @Test public void tabletFillsInAfterThirtySecondsWithoutAUsbPosition(){
  long start=1000000;
  assertFalse(GpsBackupPolicy.useTablet(start+29999,start,0));
  assertTrue(GpsBackupPolicy.useTablet(start+30000,start,0));
 }
 @Test public void eachUsbPositionRestartsTheWait(){
  long start=1000000,fix=start+25000;
  assertFalse(GpsBackupPolicy.useTablet(start+40000,start,fix));
  assertFalse(GpsBackupPolicy.useTablet(fix+29999,start,fix));
  assertTrue(GpsBackupPolicy.useTablet(fix+30000,start,fix));
 }
 @Test public void aRestartedModuleGetsAFullWait(){
  long oldFix=1000000,restart=oldFix+120000;
  assertFalse(GpsBackupPolicy.useTablet(restart+1000,restart,oldFix));
  assertTrue(GpsBackupPolicy.useTablet(restart+30000,restart,oldFix));
 }
}
