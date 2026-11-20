package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class DriverBackgroundPolicyTest {
 @Test public void busTabletsAlwaysKeepTheBusLocationGoing(){
  assertTrue(DriverBackgroundPolicy.enabled(true,false));
  assertTrue(DriverBackgroundPolicy.enabled(true,true));
  assertFalse(DriverBackgroundPolicy.canTurnOff(true));
 }
 @Test public void phonesFollowTheDriversSwitch(){
  assertFalse(DriverBackgroundPolicy.enabled(false,false));
  assertTrue(DriverBackgroundPolicy.enabled(false,true));
  assertTrue(DriverBackgroundPolicy.canTurnOff(false));
 }
 @Test public void onlyBusTabletsKeepTheUsbModuleReadingUnderAnotherScreen(){
  assertTrue(DriverBackgroundPolicy.keepReadingWhenCovered(true));
  assertFalse(DriverBackgroundPolicy.keepReadingWhenCovered(false));
 }
}
