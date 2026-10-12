import { afterEach, describe, expect, it, vi } from "vitest";
import { PayPalScheduler } from "@/lib/paypal/pacing";
import { allowRequest, resetRateLimits } from "@/lib/rate-limit";
afterEach(() => { vi.useRealTimers(); resetRateLimits(); });
describe("payment pacing",() => {
  it("bursts ten then refills at forty per minute",async () => { vi.useFakeTimers(); const scheduler = new PayPalScheduler(), done: number[] = []; const promises = Array.from({ length: 15 },(_,i) => scheduler.take().then(() => { done.push(i); })); await Promise.resolve(); expect(done).toHaveLength(10); await vi.advanceTimersByTimeAsync(7500); await Promise.all(promises); expect(done).toHaveLength(15); scheduler.reset(); });
  it("prioritizes captures over queued refunds and replay",async () => { vi.useFakeTimers(); const scheduler = new PayPalScheduler(); await Promise.all(Array.from({ length: 10 },() => scheduler.take())); const done: string[] = []; const low = scheduler.take("low").then(() => { done.push("low"); }), normal = scheduler.take("normal").then(() => { done.push("normal"); }), high = scheduler.take("high").then(() => { done.push("high"); }); await vi.advanceTimersByTimeAsync(4500); await Promise.all([low,normal,high]); expect(done).toEqual(["high","normal","low"]); scheduler.reset(); });
  it("expires queued requests without waiting for a token",async () => { vi.useFakeTimers(); const scheduler = new PayPalScheduler(); await Promise.all(Array.from({ length: 10 },() => scheduler.take())); const result = expect(scheduler.take("low",Date.now()+100)).rejects.toThrow("deadline"); await vi.advanceTimersByTimeAsync(100); await result; scheduler.reset(); });
  it("limits and refills requests independently by merchant",() => { for (let n = 0; n < 20; n++) expect(allowRequest("ip:a",20,10000)).toBe(true); expect(allowRequest("ip:a",20,10000)).toBe(false); expect(allowRequest("ip:b",20,10000)).toBe(true); expect(allowRequest("ip:a",20,13000)).toBe(true); });
});
