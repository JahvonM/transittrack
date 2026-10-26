package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class DualCameraProbeWindowTest {
 @Test public void acceptsSustainedRecentFramesFromBoth() {
  assertTrue(DualCameraProbeWindow.passed(1000,11000,150,145,10990,10980,false));
 }
 @Test public void openingHandlesWithoutFramesNeverPasses() {
  assertFalse(DualCameraProbeWindow.passed(1000,11000,0,0,0,0,false));
 }
 @Test public void oneWorkingCameraNeverPasses() {
  assertFalse(DualCameraProbeWindow.passed(1000,11000,150,0,10990,0,false));
 }
 @Test public void earlyFramesFollowedByFreezeNeverPass() {
  assertFalse(DualCameraProbeWindow.passed(1000,11000,150,150,3000,10990,false));
 }
 @Test public void shortTestNeverPasses() {
  assertFalse(DualCameraProbeWindow.passed(1000,9000,150,150,8990,8990,false));
 }
 @Test public void cancellationNeverPasses() {
  assertFalse(DualCameraProbeWindow.passed(1000,11000,150,150,10990,10990,true));
 }
 @Test public void sparseFramesNeverPass() {
  assertFalse(DualCameraProbeWindow.passed(1000,11000,29,150,10990,10990,false));
 }
 @Test public void futureOrUnsetFrameTimesAreNotFresh() {
  assertFalse(DualCameraProbeWindow.fresh(0,11000));
  assertFalse(DualCameraProbeWindow.fresh(12000,11000));
  assertFalse(DualCameraProbeWindow.fresh(9000,11000));
  assertTrue(DualCameraProbeWindow.fresh(9500,11000));
 }
}
