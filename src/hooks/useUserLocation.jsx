import { useEffect, useState } from "react";

/**
 * Continuously tracks the current user's GPS location via watchPosition.
 * Used by every dashboard map so each user always sees their own location pin.
 * Returns { location: {lat, lng} | null, error: string }.
 */
export default function useUserLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your device.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const acc = p.coords.accuracy ?? 999;
        // Skip extremely low-accuracy fixes (cell tower) to avoid big offsets
        if (acc > 500) return;
        setLocation((prev) => {
          // Only update if this fix is at least as accurate as the current one
          if (prev && prev.accuracy != null && prev.accuracy < acc) return prev;
          return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: acc };
        });
        setError("");
      },
      (err) => {
        setError(
          err.code === 1
            ? "Location permission denied. Enable location access to see yourself on the map."
            : err.code === 2
            ? "Your position is unavailable right now."
            : err.code === 3
            ? "Location request timed out."
            : "Couldn't get your location."
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { location, error };
}