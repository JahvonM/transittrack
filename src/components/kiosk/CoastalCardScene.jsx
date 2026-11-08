import React from "react";
import { Nfc, Wifi, UserRound, ChevronsUp } from "lucide-react";
import BusArtwork from "@/components/BusArtwork";
import "./coastalCardScene.css";

// The boarding screen's card animation (first shown on the T10 validator): a
// card lifts to the reader while waiting, and the reader pulses while a tap is
// being checked. Reduced-motion settings show it still.
export default function CoastalCardScene({ checking = false, vehicle, readerError, tapHint = { title: "Tap your card on the reader", detail: "Hold it near the reader until you hear the tone.", arrow: "side" } }) {
  return <section className={`tt-coastal-scene${checking ? " tt-coastal-checking" : ""}`} aria-label={checking ? "Card detected" : "How to tap your card"}>
    <div className="tt-coastal-copy" aria-live="polite">
      <h1>{checking ? "One moment…" : "Welcome aboard"}</h1>
      <p>{checking ? "Recording your tap" : tapHint.title}</p>
    </div>
    <div className="tt-coastal-art" aria-hidden="true">
      <BusArtwork vehicle={vehicle} fallbackUrl="/images/boarding-coaster.webp" width={650} className="tt-coastal-bus" />
      <div className="tt-coastal-reader"><Nfc /></div>
      <div className="tt-coastal-ripple" />
      <div className="tt-coastal-travel-card">
        <div className="tt-coastal-card-top"><b>McSWEEN</b><Wifi /></div>
        <div className="tt-coastal-card-body"><span><UserRound /></span><div><b>Passenger card</b><small>STAFF TRANSPORT</small></div></div>
        <div className="tt-coastal-card-lines"><i /><i /></div>
        <div className="tt-coastal-scan" />
      </div>
      <ChevronsUp className={`tt-coastal-tap-arrow tt-coastal-arrow-${tapHint.arrow}`} />
      {checking && <div className="tt-coastal-dots"><i /><i /><i /></div>}
    </div>
    <p className="tt-coastal-instruction">{checking ? "Card detected · Please wait. No need to tap again." : tapHint.detail}</p>
    {readerError && <p role="alert" className="tt-coastal-instruction">{readerError}</p>}
  </section>;
}
