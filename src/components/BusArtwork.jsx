import React from "react";
export default function BusArtwork({ className = "", width = 150 }) {
  return <img src="/images/transit-bus-3d.webp" alt="" aria-hidden="true" width={width} height={width} className={`object-contain drop-shadow-xl ${className}`} />;
}
