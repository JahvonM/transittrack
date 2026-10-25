import fs from "node:fs";
import {describe,it,expect} from "vitest";
const service=fs.readFileSync("android/app/src/main/java/com/transittrack/app/RearDashcamService.kt","utf8");
const activity=fs.readFileSync("android/app/src/main/java/com/transittrack/app/RearDashcamActivity.kt","utf8");
const manifest=fs.readFileSync("android/app/src/main/AndroidManifest.xml","utf8");
describe("rear-only local recording boundaries",()=>{
 it("selects only the rear camera and never configures audio",()=>{
  expect(service).toContain("CameraCharacteristics.LENS_FACING_BACK");
  expect(service).not.toContain("LENS_FACING_FRONT");
  expect(service).not.toMatch(/setAudioSource|setAudioEncoder|AudioRecord|AudioSource/);
 });
 it("keeps videos out of backup and has no upload client",()=>{
  expect(service).toContain('context.noBackupFilesDir,"rear_dashcam"');
  expect(service+activity).not.toMatch(/HttpsURLConnection|OkHttpClient|fetch\(|UploadFile|UploadPublicFile/);
 });
 it("does not export release recording components",()=>{
  expect(manifest).toMatch(/name="\.RearDashcamActivity" android:exported="false"/);
  expect(manifest).toMatch(/name="\.RearDashcamService" android:exported="false" android:foregroundServiceType="camera"/);
  expect(manifest).toContain("android.permission.FOREGROUND_SERVICE_CAMERA");
 });
 it("does not silently restart recording and keeps visible stop controls",()=>{
  expect(service).not.toContain("START_STICKY");
  expect(service).toContain("START_NOT_STICKY");
  expect(service).toContain('"Rear dashcam · video only"');
  expect(service).toContain('"Stop",stop');
  // The record button turns into a visible Stop while recording.
  expect(activity).toContain('if (active) "■  Stop recording" else "●  Start recording"');
 });
 it("requires a native camera lease and keeps failed footage",()=>{
  expect(service).toContain('TabletCameraLease.acquire("dashcam")');
  expect(service).toContain('store.finish(output,good && output.length()>0,protectCurrent || !good)');
  expect(service).not.toContain("output.delete");
 });
});
