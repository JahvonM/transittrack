package com.transittrack.app;
/** Serializes this tablet's WebView live writes against native live/history writes. */
final class DriverUploadGate {
 private String page=""; private long until; private boolean nativeBusy;
 synchronized boolean pageBegin(String id,long now) {
  if(nativeBusy || (!page.isEmpty() && now<until))return false;
  page=id;until=now+20000;return true;
 }
 synchronized void pageEnd(String id) { if(page.equals(id)){page="";until=0;} }
 synchronized boolean nativeBegin(long now) {
  if(nativeBusy || (!page.isEmpty() && now<until))return false;
  page="";until=0;nativeBusy=true;return true;
 }
 synchronized void nativeEnd(){nativeBusy=false;}
}
