import { useEffect, useState } from "react";

/**
 * Continuously tracks the current user's GPS location via watchPosition.
 * Used by every dashboard map so each user always sees their own location pin.
 * Returns { location: {lat, lng} | null, error: string }.
 */
export default function useUserLocation(enabled = true) {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your device.");
      return;
    }
    let cancelled = false, received = false;
    const success = (p) => {
        if (cancelled || !Number.isFinite(p.coords.latitude) || !Number.isFinite(p.coords.longitude)) return;
        received = true;
        const acc = p.coords.accuracy ?? 999;
        setLocation(() => {
          return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: acc };
        });
        setError("");
      };
    const failure = (err) => {
        if (cancelled || (received && err.code !== 1)) return;
        setError(
          err.code === 1
            ? "Location permission denied. Enable location access to see yourself on the map."
            : err.code === 2
            ? "Your position is unavailable right now."
            : err.code === 3
            ? "Location request timed out."
            : "Couldn't get your location."
        );
      };
    // A one-shot request also recovers browsers whose watch has not produced a fix yet.
    navigator.geolocation.getCurrentPosition(success, failure, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    const id = navigator.geolocation.watchPosition(success, failure, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    return () => { cancelled = true; navigator.geolocation.clearWatch(id); };
  }, [enabled, request]);

  return { location, error, retry: () => { setError(""); setRequest(n => n + 1); } };
}