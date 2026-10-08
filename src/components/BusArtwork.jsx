import React, { useEffect, useState } from "react";
export default function BusArtwork({ vehicle, imageUrl, className = "", width = 150, alt = "" }) {
 const url = imageUrl || vehicle?.image_url || "";
 const [failed, setFailed] = useState(false);
 useEffect(() => setFailed(false), [url]);
 return <img src={!failed && url ? url : "/images/transit-bus-3d.webp"} onError={() => setFailed(true)} alt={alt} aria-hidden={alt ? undefined : true} width={width} height={width} className={`object-contain drop-shadow-xl ${className}`} />;
}
