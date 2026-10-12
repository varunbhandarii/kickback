export type Priority = "high" | "normal" | "low";
export class PayPalScheduler {
  private tokens: number;
  private updated: number;
  private timer?: ReturnType<typeof setTimeout>;
  private queues: Record<Priority, (() => void)[]> = { high: [], normal: [], low: [] };
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
  private drain() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const current = this.now(); this.tokens = Math.min(this.capacity,this.tokens+(current-this.updated)*this.rate/60000); this.updated = current;
    while (this.tokens >= 1) {
      const lane = (["high","normal","low"] as const).find((p) => this.queues[p].length);
      if (!lane) return;
      this.tokens--; this.queues[lane].shift()!();
    }
    if (Object.values(this.queues).some((q) => q.length)) this.timer = setTimeout(() => this.drain(),Math.max(1,Math.ceil((1-this.tokens)*60000/this.rate)));
  }
  reset() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.tokens = this.capacity; this.updated = this.now(); for (const lane of Object.values(this.queues)) for (const resolve of lane.splice(0)) resolve(); }
}
let scheduler: PayPalScheduler | undefined;
export function paceRequest(priority: Priority = "normal",deadline?: number) { scheduler ??= new PayPalScheduler(Math.max(1,Math.min(40,Number(process.env.PAYPAL_RATE_PER_MIN ?? 40)))); return scheduler.take(priority,deadline); }
