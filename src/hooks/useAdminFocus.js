import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// The bus, driver, route or person picked on an admin screen, kept in the
// address (?bus=…) so the other tabs of the same hub open on it too (see
// carry in lib/adminMenu.js). Setting it replaces the address entry, so Back
// still leaves the screen instead of stepping through every pick.
export default function useAdminFocus(name) {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) || "";
  const set = useCallback((next, also = {}) => {
    setParams((previous) => {
      const out = new URLSearchParams(previous);
      for (const [key, v] of Object.entries({ [name]: next, ...also })) {
        if (v) out.set(key, v);
        else out.delete(key);
      }
      return out;
    }, { replace: true });
  }, [name, setParams]);
  return [value, set];
}
