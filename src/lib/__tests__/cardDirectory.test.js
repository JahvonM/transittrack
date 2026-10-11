import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCardDirectory } from "@/lib/cardDirectory";

afterEach(() => vi.useRealTimers());
const clientWith = invoke => ({ functions: { invoke } });

describe("card directory loading", () => {
  it("shares overlapping reads but fetches fresh data after completion", async () => {
    let finish;
    const first = new Promise(resolve => { finish = resolve; });
    const data = { people: [{ key: "p1" }], cards: [], vehicles: [], tablets: [] };
    const invoke = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ data });
    const client = clientWith(invoke);
    const a = loadCardDirectory(client), b = loadCardDirectory(client);
    expect(a).toBe(b);
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(1);
    finish({ data });
    await expect(a).resolves.toEqual(data);
    await loadCardDirectory(client);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith("nfcCards", { action: "people" });
  });

  it.each(["direct", "sdk", "date"])("honors the full server cooldown (%s)", async shape => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    const headers = shape === "date"
      ? new Headers({ "retry-after": "Sun, 11 Oct 2026 12:00:30 GMT" })
      : { "retry-after": "30" };
    const response = { status: 429, headers };
    const error = shape === "sdk" ? { originalError: { response } } : { response };
    const invoke = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ data: { people: [] } });
    const pending = loadCardDirectory(clientWith(invoke));
    await vi.advanceTimersByTimeAsync(29999);
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ people: [] });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not retry authorization failures and allows a later fresh read", async () => {
    const error = Object.assign(new Error("Forbidden"), { status: 403 });
    const invoke = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ data: { people: [] } });
    const client = clientWith(invoke);
    await expect(loadCardDirectory(client)).rejects.toBe(error);
    expect(invoke).toHaveBeenCalledTimes(1);
    await expect(loadCardDirectory(client)).resolves.toEqual({ people: [] });
  });

  it("stops after four rate-limited attempts", async () => {
    vi.useFakeTimers();
    const error = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
    const invoke = vi.fn().mockRejectedValue(error);
    const pending = loadCardDirectory(clientWith(invoke));
    const check = expect(pending).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await check;
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  it("does not share a directory between different clients", async () => {
    const a = clientWith(vi.fn().mockResolvedValue({ data: { people: ["a"] } }));
    const b = clientWith(vi.fn().mockResolvedValue({ data: { people: ["b"] } }));
    await expect(Promise.all([loadCardDirectory(a), loadCardDirectory(b)])).resolves.toEqual([{ people: ["a"] }, { people: ["b"] }]);
  });
});
