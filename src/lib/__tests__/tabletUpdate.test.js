import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installMemoryStorage } from "./memoryStorage";
vi.mock("@/lib/appHealth", () => ({ APP_BUILD: "2026-10-05 10:00" }));
import { applyUpdate } from "@/lib/tabletUpdate";

function worker(ok) {
  const controller = { postMessage: vi.fn((msg, [port]) => setTimeout(() => port.postMessage({ ok }), 0)) };
  const reg = { update: vi.fn(async () => {}), active: controller };
  vi.stubGlobal("navigator", { serviceWorker: { controller, getRegistration: async () => reg } });
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  return { controller, reload };
}
beforeEach(() => installMemoryStorage());
afterEach(() => vi.unstubAllGlobals());

describe("tablet updates", () => {
  it("stays on the running version when the new one can't be fully saved", async () => {
    const { controller, reload } = worker(false);
    expect(await applyUpdate("2026-10-05T12:00:00Z")).toBe(false);
    expect(controller.postMessage.mock.calls[0][0]).toEqual({ type: "tt-stage-update" });
    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem("tt_update_applied_at")).toBeNull();
  });
  it("reloads into the new version once it's saved", async () => {
    const { reload } = worker(true);
    expect(await applyUpdate("2026-10-05T12:00:00Z")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("tt_update_applied_at")).toBe("2026-10-05T12:00:00Z");
  });
});
