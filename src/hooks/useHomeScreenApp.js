import { useEffect } from "react";
import { swapHomeScreenApp } from "@/lib/homeScreenApp";

// While mounted, "Add to Home Screen" makes an icon for this page (see homeScreenApp.js).
export default function useHomeScreenApp({ manifest, title } = {}) {
  useEffect(() => swapHomeScreenApp(document, { manifest, title }), [manifest, title]);
}
