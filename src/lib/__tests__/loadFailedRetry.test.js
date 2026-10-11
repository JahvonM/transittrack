import { afterEach, expect, it, vi } from "vitest";
const { toast }=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock("@/components/ui/use-toast",()=>({toast}));
vi.mock("@/components/ui/toast",()=>({ToastAction:()=>null}));
import { loadFailed } from "@/lib/loadFailed";
afterEach(()=>vi.useRealTimers());
it("does not create new automatic reload cycles after read retries finish",async()=>{
 vi.useFakeTimers();
 const retry=vi.fn();
 loadFailed(retry);
 await vi.advanceTimersByTimeAsync(60000);
 expect(retry).not.toHaveBeenCalled();
 expect(toast).toHaveBeenCalledTimes(1);
 toast.mock.calls[0][0].action.props.onClick();
 expect(retry).toHaveBeenCalledTimes(1);
});
