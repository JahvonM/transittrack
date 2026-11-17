import React, { useEffect, useState } from "react";
// The McSween van, cut out from its photo: shown wherever a bus has no
// photo or 3D render of its own (loading screen, passenger app, driver
// screens, boarding kiosks, fleet lists).
export const DEFAULT_BUS_ART = "/images/mcsween-van-cut.webp";
// loading="lazy" for long lists (fleet, cameras): the picture loads only when
// it is scrolled near, which keeps lists quick on mobile data.
export default function BusArtwork({ vehicle, imageUrl, fallbackUrl = DEFAULT_BUS_ART, className = "", width = 150, alt = "", loading }) {
 const url = imageUrl || vehicle?.image_url || "";
 const [failed, setFailed] = useState(false);
 useEffect(() => setFailed(false), [url]);
 return <img src={!failed && url ? url : fallbackUrl} onError={() => setFailed(true)} alt={alt} aria-hidden={alt ? undefined : true} width={width} height={width} loading={loading} decoding={loading === "lazy" ? "async" : undefined} className={`tt-bus-artwork object-contain drop-shadow-xl ${className}`} />;
}
