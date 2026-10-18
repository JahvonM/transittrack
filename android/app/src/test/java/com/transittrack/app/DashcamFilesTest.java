package com.transittrack.app;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.Files;
import java.util.*;

public class DashcamFilesTest {
 @Rule public TemporaryFolder temp = new TemporaryFolder();
 private File root; private DashcamFiles store;
 @Before public void setup() throws Exception { root=temp.newFolder("rear_dashcam");store=new DashcamFiles(root); }
 private File clip(long at,long size,boolean protect) throws Exception {
  File partial=store.create(at);
  try(RandomAccessFile out=new RandomAccessFile(partial,"rw")){out.setLength(size);}
  return store.finish(partial,true,protect);
 }
 @Test public void finalizesAndListsOnlyOwnClips() throws Exception {
  File other=new File(root,"passenger-data.json");Files.write(other.toPath(),new byte[]{1});
  File f=clip(1792180000000L,1024,false);
  assertEquals(1,store.clips().size());assertEquals(1024,store.bytes());
  assertTrue(f.exists());assertTrue(other.exists());
 }
 @Test public void deletesOldestUnprotectedFirstWithinOwnBudget() throws Exception {
  File old=clip(1792180000000L,DashcamFiles.LIMIT/2,false);
  File newer=clip(1792180001000L,DashcamFiles.LIMIT/2,false);
  File other=new File(root,"other.bin");Files.write(other.toPath(),new byte[]{1});
  assertTrue(store.roomForNext(()->Long.MAX_VALUE));
  assertFalse(old.exists());assertTrue(newer.exists());assertTrue(other.exists());
 }
 @Test public void protectedClipsCauseSafeStopRatherThanDeletion() throws Exception {
  File f=clip(1792180000000L,DashcamFiles.LIMIT,true);
  assertFalse(store.roomForNext(()->Long.MAX_VALUE));assertTrue(f.exists());
 }
 @Test public void currentPartialNeverGetsPruned() throws Exception {
  File f=store.create(1792180000000L);
  try(RandomAccessFile out=new RandomAccessFile(f,"rw")){out.setLength(DashcamFiles.LIMIT);}
  assertFalse(store.roomForNext(()->Long.MAX_VALUE));assertTrue(f.exists());
 }
 @Test public void lowFreeStorageStopsWithoutTouchingUnrelatedFiles() throws Exception {
  File other=new File(root,"other.bin");Files.write(other.toPath(),new byte[]{1});
  assertFalse(store.roomForNext(()->DashcamFiles.MIN_FREE-1));assertTrue(other.exists());
 }
 @Test public void crashRecoveryPreservesAndProtectsIncompleteFootage() throws Exception {
  File f=store.create(1792180000000L);Files.write(f.toPath(),new byte[]{7,8,9});
  store.recover();File recovered=store.clips().get(0);
  assertFalse(DashcamFiles.partial(recovered));assertTrue(DashcamFiles.protectedClip(recovered));
  assertTrue(recovered.getName().contains("incomplete"));assertEquals(3,recovered.length());
 }
 @Test public void explicitProtectionSurvivesLoopCleanup() throws Exception {
  File f=clip(1792180000000L,DashcamFiles.LIMIT,false);
  File locked=store.protect(f.getName());
  assertFalse(store.roomForNext(()->Long.MAX_VALUE));assertTrue(locked.exists());
 }
 @Test public void explicitDeleteOnlyTargetsNamedCompletedClip() throws Exception {
  File f=clip(1792180000000L,1024,true);
  assertTrue(store.delete(f.getName()));assertFalse(f.exists());
  File partial=store.create(1792180001000L);
  assertFalse(store.delete(partial.getName()));assertTrue(partial.exists());
 }
 @Test public void refusesTraversalAndOutsideSymlink() throws Exception {
  for(String name:Arrays.asList("../secret","/tmp/secret","bad.mp4","1792180000000-aa.mp4")) {
   try{store.find(name);fail(name);}catch(IOException expected){}
  }
  File outside=temp.newFile("outside.mp4");
  String name="1792180000000-aaaaaaaaaaaaaaaa.mp4";
  Files.createSymbolicLink(new File(root,name).toPath(),outside.toPath());
  try{store.find(name);fail("symlink");}catch(IOException expected){}
  assertTrue(store.clips().isEmpty());assertTrue(outside.exists());
 }
}
