package com.transittrack.app

import android.content.ContextWrapper
import org.json.JSONObject
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.spec.SecretKeySpec

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28],manifest=Config.NONE)
class DriverTrackingStoreTest {
 @JvmField @Rule val folder=TemporaryFolder()
 private lateinit var context:ContextWrapper
 private val testKey=SecretKeySpec(ByteArray(32){7},"AES")
 private fun store()=DriverTrackingStore(context){testKey}
 @Before fun setup(){val root=folder.newFolder();context=object:ContextWrapper(RuntimeEnvironment.getApplication()){override fun getNoBackupFilesDir()=root}}
 private fun point(id:String)=JSONObject().put("queue_id",id).put("timestamp",System.currentTimeMillis()).put("lat",12.05).put("lng",-61.75)
 @Test fun queuedPointsSurviveStoreCloseAndAcknowledgeOnlyExactIds(){
  var s=store();s.add("bus-a",point("one"));val sending=s.batch("bus-a");s.add("bus-a",point("two"));s.close()
  s=store();assertEquals(2,s.count());s.acknowledge(sending);assertEquals("two",s.batch("bus-a").single().getString("queue_id"));s.close()
 }
 @Test fun originalAssignmentAndReviewRowsAreRetainedWithoutBlockingNewBus(){
  val s=store();s.add("old-bus",point("old"));s.add("new-bus",point("new"));s.reviewOld("new-bus",System.currentTimeMillis())
  assertEquals(1,s.count("needs_review"));assertEquals("new",s.batch("new-bus").single().getString("queue_id"))
  assertEquals(2,s.page(0,0).getJSONArray("points").length());assertEquals(1,s.page(0,0,"new-bus").getJSONArray("points").length());s.close()
 }
 @Test fun rejectedRowsCanBeExportedAndAreNeverAcknowledgedAsUploaded(){
  val s=store();s.add("bus",point("one"));s.acknowledge(s.batch("bus"),true)
  assertEquals(1,s.count());assertTrue(s.batch("bus").isEmpty());assertEquals("needs_review",s.page(0,0).getJSONArray("points").getJSONObject(0).getString("state"));s.close()
 }
 @Test fun credentialsAreEncryptedAndSurviveRestartButOldWorkerCannotClearNewLease(){
  var s=store();val lease=JSONObject().put("generation","first").put("device_token","SYNTHETIC_PRIVATE_CREDENTIAL")
  s.saveLease(lease);assertFalse(String(java.io.File(context.noBackupFilesDir,"driver_tracking_lease").readBytes()).contains("SYNTHETIC_PRIVATE_CREDENTIAL"));s.close()
  s=store();assertEquals("SYNTHETIC_PRIVATE_CREDENTIAL",s.readLease()!!.getString("device_token"))
  s.saveLease(lease.put("generation","second"));s.clearLeaseGeneration("first");assertNotNull(s.readLease());s.clearLeaseGeneration("second");assertNull(s.readLease());s.close()
 }
 @Test fun wrongEncryptionKeyDoesNotReturnCredentialsOrDestroySavedGps(){
  var s=store();s.add("bus",point("one"));s.saveLease(JSONObject().put("secret","SYNTHETIC"));s.close()
  s=DriverTrackingStore(context){SecretKeySpec(ByteArray(32){8},"AES")}
  assertThrows(Exception::class.java){s.readLease()};assertEquals(1,s.count());s.close()
 }
}
