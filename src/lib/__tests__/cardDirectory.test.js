import { afterEach, expect, it, vi } from "vitest";
import { loadCardDirectory } from "@/lib/cardDirectory";
afterEach(() => vi.useRealTimers());
it("shares pending reads and fetches fresh after completion", async () => {
 let finish;
 const invoke = vi.fn().mockReturnValueOnce(new Promise(r => { finish = r; })).mockResolvedValue({data:{people:[]}});
 const client = {functions:{invoke}};
 const a=loadCardDirectory(client), b=loadCardDirectory(client);
 expect(a).toBe(b);
 await Promise.resolve();
 expect(invoke).toHaveBeenCalledTimes(1);
 finish({data:{people:["p"]}});
 await expect(a).resolves.toEqual({people:["p"]});
 await loadCardDirectory(client);
 expect(invoke).toHaveBeenCalledTimes(2);
});
it.each(["direct","sdk","date"])("honors a 30 second cooldown: %s", async shape => {
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
 const headers=shape==="date"?new Headers({"retry-after":"Sun, 11 Oct 2026 12:00:30 GMT"}):{"retry-after":"30"};
 const response={status:429,headers};
 const error=shape==="sdk"?{originalError:{response}}:{response};
 const invoke=vi.fn().mockRejectedValueOnce(error).mockResolvedValue({data:{people:[]}});
 const pending=loadCardDirectory({functions:{invoke}});
 await vi.advanceTimersByTimeAsync(29999);
 expect(invoke).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);
 await expect(pending).resolves.toEqual({people:[]});
});
it("does not retry forbidden errors and permits a later read", async () => {
 const error={status:403};
 const invoke=vi.fn().mockRejectedValueOnce(error).mockResolvedValue({data:{people:[]}});
 const client={functions:{invoke}};
 await expect(loadCardDirectory(client)).rejects.toBe(error);
 expect(invoke).toHaveBeenCalledTimes(1);
 await expect(loadCardDirectory(client)).resolves.toEqual({people:[]});
});
it("bounds retries at four attempts", async () => {
 vi.useFakeTimers();
 const error={status:429};
 const invoke=vi.fn().mockRejectedValue(error);
 const check=expect(loadCardDirectory({functions:{invoke}})).rejects.toBe(error);
 await vi.runAllTimersAsync(); await check;
 expect(invoke).toHaveBeenCalledTimes(4);
});

it("keeps directory and card issuing responses separate",async()=>{
 const invoke=vi.fn(async(name,{action})=>({data:{people:[action]}}));const client={functions:{invoke}};
 const [cards,directory]=await Promise.all([loadCardDirectory(client),loadCardDirectory(client,"directory")]);
 expect(cards.people).toEqual(["people"]);expect(directory.people).toEqual(["directory"]);
});
