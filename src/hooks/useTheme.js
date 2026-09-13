// Re-exports the single canonical theme hook (src/lib/useTheme.js) so every
// theme toggle in the app (driver tablet, account page, ...) reads/writes the
// same "tt-theme" localStorage key that index.html's pre-render bootstrap
// script checks. These used to be two separate implementations under two
// different keys, so a driver's dark-mode choice was saved under a key the
// page-load bootstrap never looked at and got silently reverted on reload.
import { useTheme } from "@/lib/useTheme";

export default useTheme;
