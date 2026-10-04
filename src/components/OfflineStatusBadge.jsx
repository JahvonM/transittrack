import React from "react";
import ConnectionPill from "@/components/system/ConnectionPill";

// Connection + upload-queue status. Same props as before; now drawn with the
// shared ConnectionPill so colours meet contrast in light and dark themes.
export default function OfflineStatusBadge({ online, pendingCount }) {
  const queued = pendingCount > 0;
  if (online && !queued) return <ConnectionPill state="online" />;
  if (online && queued) return <ConnectionPill state="syncing" count={pendingCount} />;
  return <ConnectionPill state="offline" count={queued ? pendingCount : 0} />;
}
