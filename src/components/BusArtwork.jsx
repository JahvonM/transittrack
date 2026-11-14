import React, { useEffect, useState } from "react";

// The picture for a bus with no picture of its own (Admin → Vehicles → Bus
// photo). It is a photo, not a cut-out, so it is framed and fills its box
// (index.css .tt-bus-photo); a bus's own picture keeps the cut-out look.
// Animated scenes and map markers keep their drawn buses (fallbackUrl).
export const DEFAULT_BUS_PHOTO = "/images/mcsween-van.webp";

export default function BusArtwork({ vehicle, imageUrl, fallbackUrl = DEFAULT_BUS_PHOTO, className = "", width = 150, alt = "" }) {
 const url = imageUrl || vehicle?.image_url || "";
 const [failed, setFailed] = useState(false);
 useEffect(() => setFailed(false), [url]);
 const src = !failed && url ? url : fallbackUrl;
 const photo = src === DEFAULT_BUS_PHOTO;
 return <img src={src} onError={() => setFailed(true)} alt={alt} aria-hidden={alt ? undefined : true} width={width} height={photo ? Math.round(width * 9 / 16) : width}
  className={`tt-bus-artwork ${photo ? "tt-bus-photo" : "object-contain drop-shadow-xl"} ${className}`} />;
}
