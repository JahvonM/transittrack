import { useEffect } from "react";
import { activateChatRefresh } from "@/lib/scopedEntities";
export function useChatActivity(active) {
 useEffect(() => active ? activateChatRefresh() : undefined,[active]);
}
