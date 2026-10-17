package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class RecordingIceCandidatesTest {
 private static final String DATA="v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sctp-port:5000\r\n";
 private static final String VIDEO="v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n";
 private static final String RELAY="candidate:1 1 udp 10 203.0.113.1 49199 typ relay raddr 0.0.0.0 rport 0";
 @Test public void recordingsRetainRelayOnDataChannelOffer() {
  SupportIceCandidates c=SupportIceCandidates.forRecordings();c.add(0,RELAY);
  String sdp=c.merge(DATA+"a=end-of-candidates\r\n");
  assertTrue(sdp.contains("m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n"));
  assertTrue(sdp.contains("a="+RELAY+"\r\n"));
  assertFalse(sdp.contains("a=end-of-candidates"));
  assertTrue(SupportIceCandidates.ready(sdp,false,true));
 }
 @Test public void recordingsStillWaitForRelay() {
  SupportIceCandidates c=SupportIceCandidates.forRecordings();
  assertFalse(SupportIceCandidates.ready(c.merge(DATA),true,true));
  c.add(0,"candidate:2 1 udp 20 192.0.2.1 5000 typ host");
  assertFalse(SupportIceCandidates.ready(c.merge(DATA),true,true));
 }
 @Test(expected=IllegalArgumentException.class) public void liveVideoStillRejectsFileChannel() {new SupportIceCandidates().merge(DATA);}
 @Test(expected=IllegalArgumentException.class) public void recordingsRejectLiveCapture() {SupportIceCandidates.forRecordings().merge(VIDEO);}
 @Test(expected=IllegalArgumentException.class) public void recordingsRejectMixedCapture() {SupportIceCandidates.forRecordings().merge(DATA+"m=video 9 UDP/TLS/RTP/SAVPF 96\r\n");}
 @Test(expected=IllegalArgumentException.class) public void recordingsRejectOtherApplicationProtocol() {SupportIceCandidates.forRecordings().merge(DATA.replace("UDP/DTLS/SCTP","RTP/AVP"));}
}
