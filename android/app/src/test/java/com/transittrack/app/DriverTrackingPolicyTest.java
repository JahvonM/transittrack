package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class DriverTrackingPolicyTest {
 @Test public void expiryRollbackAndMaximumGrantAreEnforced(){
  long at=1000000;
  assertTrue(DriverTrackingPolicy.leaseValid(at,at,at+3600000));
  assertFalse(DriverTrackingPolicy.leaseValid(at+3600000,at,at+3600000));
  assertFalse(DriverTrackingPolicy.leaseValid(at-60001,at,at+3600000));
  assertFalse(DriverTrackingPolicy.leaseValid(at,at,at+21*3600000L));
 }
 @Test public void invalidStaleFutureAndWeakSamplesAreNotSaved(){
  long now=1000000;
  assertTrue(DriverTrackingPolicy.sample(12,-61,5,0,now,now));
  assertFalse(DriverTrackingPolicy.sample(91,-61,5,0,now,now));
  assertFalse(DriverTrackingPolicy.sample(12,-61,101,0,now,now));
  assertFalse(DriverTrackingPolicy.sample(12,-61,5,101,now,now));
  assertFalse(DriverTrackingPolicy.sample(12,-61,5,0,now-10001,now));
  assertFalse(DriverTrackingPolicy.sample(12,-61,5,0,now+2001,now));
 }
 @Test public void networkRetriesBackOffAndHonorServerCooldown(){
  assertEquals(30000,DriverTrackingPolicy.retryDelay(1,0));
  assertEquals(300000,DriverTrackingPolicy.retryDelay(100,0));
  assertEquals(3600000,DriverTrackingPolicy.retryDelay(1,3600));
  assertEquals(3600000,DriverTrackingPolicy.retryDelay(1,Long.MAX_VALUE));
 }
}
