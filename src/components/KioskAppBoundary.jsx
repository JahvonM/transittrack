import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isKioskInstall, isDriverStoreInstall, driverStorePathAllowed, kioskPathAllowed, rememberTabletMode, savedTabletPath, tabletModeForPath } from "@/lib/kioskApp";

export default function KioskAppBoundary({ children }) {
  const { pathname } = useLocation();
  const kiosk = isKioskInstall();
  const mode = tabletModeForPath(pathname);
  useEffect(() => {
    if (kiosk && mode) rememberTabletMode(mode);
  }, [kiosk, mode]);
  if (kiosk && !kioskPathAllowed(pathname)) return <Navigate to={savedTabletPath()} replace />;
  if (!kiosk && isDriverStoreInstall() && !driverStorePathAllowed(pathname)) return <Navigate to="/driver" replace />;
  return children;
}
