package com.transittrack.app;
import org.junit.*;
import static org.junit.Assert.*;
public class TabletCameraLeaseTest {
 @After public void reset(){TabletCameraLease.release("support");TabletCameraLease.release("dashcam");}
 @Test public void cameraConsumersAreExclusive(){
  assertTrue(TabletCameraLease.acquire("dashcam"));
  assertFalse(TabletCameraLease.acquire("support"));assertFalse(TabletCameraLease.acquire("dashcam"));
  assertTrue(TabletCameraLease.occupied());
  TabletCameraLease.release("dashcam");assertTrue(TabletCameraLease.acquire("support"));
 }
 @Test public void wrongOwnerCannotReleaseRecording(){
  assertTrue(TabletCameraLease.acquire("dashcam"));TabletCameraLease.release("support");
  assertTrue(TabletCameraLease.occupied());
 }
 @Test public void unknownOwnersCannotAcquire(){assertFalse(TabletCameraLease.acquire("other"));assertFalse(TabletCameraLease.occupied());}
}
