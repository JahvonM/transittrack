import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, RotateCw, SearchX, WifiOff } from "lucide-react";
import { reloadForUpdate, reloadIntoNewest } from "@/lib/updateReload";

// An address the app doesn't have. Usually it's a page from a newer version
// than the saved copy this device opened: the service worker (public/sw.js)
// opens the saved copy first and updates it in the background. So the newest
// version is fetched and the page reloads into it, at most once a minute (see
// lib/updateReload.js). After that, or while offline, it says plainly that
// the page isn't there.
const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

export default function PageNotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(true);
  const [online, setOnline] = useState(isOnline);

  // Before the first paint, so "Page not found" doesn't flash up first.
  useLayoutEffect(() => { setUpdating(reloadForUpdate()); }, [pathname]);

  // Back online: try the newest version then.
  useEffect(() => {
    const up = () => { setOnline(true); if (reloadForUpdate()) setUpdating(true); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const tryAgain = () => { setUpdating(true); reloadIntoNewest(); };

  return (
    <div className="min-h-[100dvh] grid place-items-center bg-background p-6">
      <div className="max-w-sm w-full text-center rounded-3xl border border-border bg-card p-8 space-y-4 shadow-xl">
        {updating ? (
          <div role="status" className="space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <RotateCw className="w-7 h-7 animate-spin" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-heading font-bold">Getting the newest version…</h1>
              <p className="text-sm text-muted-foreground">This page may be new. One moment while the app updates.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-secondary text-muted-foreground grid place-items-center">
              <SearchX className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-heading font-bold">Page not found</h1>
              <p className="text-sm text-muted-foreground">
                There's no page at <span className="font-medium text-foreground break-all">{pathname}</span>.
              </p>
            </div>
            {!online && (
              <p className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-left text-sm">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>If this page is new, it opens once you're back online.</span>
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={tryAgain}
                className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2"
              >
                <RotateCw className="w-4 h-4" aria-hidden="true" /> Try again
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="h-11 rounded-xl border border-border font-medium inline-flex items-center justify-center gap-2 hover:bg-accent"
              >
                <Home className="w-4 h-4" aria-hidden="true" /> Go home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
