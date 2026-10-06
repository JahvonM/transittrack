import { describe, it, expect, vi, afterEach } from "vitest";
import { scopedEntities, withRateLimitRetry } from "@/lib/scopedEntities";

const tooMany = () => Object.assign(new Error("Too many requests"), { status: 429 });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("scoped entity calls under Base44 rate limits", () => {
  it("waits and retries a rate-limited list instead of failing the page", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const client = { functions: { invoke: vi.fn(async () => { calls++; if (calls < 3) throw tooMany(); return { data: { result: [{ id: "t1" }] } }; }) } };
    const pending = scopedEntities(client).KioskDevice.list("-created_date");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual([{ id: "t1" }]);
    expect(calls).toBe(3);
  });

  it("does not retry real errors such as a forbidden request", async () => {
    const forbidden = Object.assign(new Error("Forbidden"), { status: 403 });
    const fn = vi.fn(async () => { throw forbidden; });
    await expect(withRateLimitRetry(fn)).rejects.toBe(forbidden);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after a few tries so a page can still show its error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => { throw tooMany(); });
    const pending = withRateLimitRetry(fn, { attempts: 3, baseMs: 10 });
    const check = expect(pending).rejects.toMatchObject({ status: 429 });
    await vi.runAllTimersAsync();
    await check;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("runs at most four calls at once", async () => {
    let running = 0, peak = 0;
    const client = { functions: { invoke: vi.fn(async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--; return { data: { result: [] } };
    }) } };
    const entities = scopedEntities(client);
    await Promise.all(Array.from({ length: 12 }, (_, i) => entities[`E${i}`].list()));
    expect(client.functions.invoke).toHaveBeenCalledTimes(12);
    expect(peak).toBe(4);
  });

  it("a background tab does not poll live lists", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { visibilityState: "hidden", addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const client = { functions: { invoke: vi.fn(async () => ({ data: { result: [] } })) } };
    const stop = scopedEntities(client).Vehicle.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(35000);
    expect(client.functions.invoke).not.toHaveBeenCalled();
    stop();
  });
});
