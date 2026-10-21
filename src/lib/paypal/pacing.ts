export type Priority = "high" | "normal" | "low";
/** After a 429 the sandbox blocks the IP for about five minutes; background work waits that out. */
export const THROTTLE_PAUSE_MS: Record<Priority, number> = { high: 30000, normal: 30000, low: 300000 };
export class PayPalScheduler {
  private tokens: number;
  private updated: number;
  private timer?: ReturnType<typeof setTimeout>;
  private queues: Record<Priority, (() => void)[]> = { high: [], normal: [], low: [] };
  private pausedUntil: Record<Priority, number> = { high: 0, normal: 0, low: 0 };
  constructor(private rate = 40, private capacity = 10, private now = Date.now) { this.tokens = capacity; this.updated = now(); }
  take(priority: Priority = "normal", deadline?: number) {
    return new Promise<void>((resolve,reject) => {
      if (deadline && this.now() >= deadline) { reject(new Error("PayPal request deadline reached")); return; }
      let expiration: ReturnType<typeof setTimeout> | undefined;
      const grant = () => { if (expiration) clearTimeout(expiration); resolve(); };
      if (deadline) expiration = setTimeout(() => { const index = this.queues[priority].indexOf(grant); if (index >= 0) this.queues[priority].splice(index,1); reject(new Error("PayPal request deadline reached")); },deadline-this.now());
      this.queues[priority].push(grant); this.drain();
    });
  }
  /** Holds every lane after a 429: low for five minutes, the rest for 30 seconds. */
  throttle() {
    const current = this.now();
    for (const lane of ["high","normal","low"] as const) this.pausedUntil[lane] = Math.max(this.pausedUntil[lane],current+THROTTLE_PAUSE_MS[lane]);
    this.tokens = 0; this.drain();
  }
  private drain() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const current = this.now(); this.tokens = Math.min(this.capacity,this.tokens+(current-this.updated)*this.rate/60000); this.updated = current;
    const open = (p: Priority) => this.pausedUntil[p] <= current;
    while (this.tokens >= 1) {
      const lane = (["high","normal","low"] as const).find((p) => this.queues[p].length && open(p));
      if (!lane) break;
      this.tokens--; this.queues[lane].shift()!();
    }
    const waiting = (["high","normal","low"] as const).filter((p) => this.queues[p].length);
    if (!waiting.length) return;
    const refill = Math.max(1,Math.ceil((1-this.tokens)*60000/this.rate));
    const wake = Math.min(...waiting.map((p) => open(p) ? refill : Math.max(refill,this.pausedUntil[p]-current)));
    this.timer = setTimeout(() => this.drain(),wake);
  }
  reset() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.tokens = this.capacity; this.updated = this.now(); this.pausedUntil = { high: 0, normal: 0, low: 0 }; for (const lane of Object.values(this.queues)) for (const resolve of lane.splice(0)) resolve(); }
}
let scheduler: PayPalScheduler | undefined;
const pacer = () => (scheduler ??= new PayPalScheduler(Math.max(1,Math.min(40,Number(process.env.PAYPAL_RATE_PER_MIN ?? 40)))));
export function paceRequest(priority: Priority = "normal",deadline?: number) { return pacer().take(priority,deadline); }
/** Called on a PayPal 429: pause this process's requests and count it for the status page. */
export function noteThrottle() {
  pacer().throttle();
  console.warn(JSON.stringify({ action: "paypal_throttled" }));
  void import("./throttle-log").then((m) => m.recordThrottle()).catch(() => undefined);
}
