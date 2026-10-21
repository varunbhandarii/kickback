"use server";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/dal";
import { getEnv } from "@/lib/env";
import { allowRequestPer, headerIp } from "@/lib/rate-limit";
import {
  DEMO_COOKIE,
  DEMO_SIGN_IN_HEADER,
  DEMO_VIEWER_EMAIL,
  demoSignInToken,
  viewerKey,
} from "@/lib/demo/accounts";
import { demoPaymentsUnavailable, executeDemoRun, startDemoRun } from "@/lib/demo/runs";
import { publishedCredentials, reserveBuyer } from "@/lib/demo/buyers";
export type DemoState = { error?: string; lastRunId?: string };
async function visitor() {
  const env = getEnv(),
    ip = headerIp(await headers());
  return { ip, key: viewerKey(ip, env.BETTER_AUTH_SECRET ?? "") };
}
/** Signs the visitor in to the shared read-only account; its password stays on the server. */
export async function startDemoSession(): Promise<DemoState> {
  const env = getEnv();
  const session = await getSession();
  if (session?.user.email === DEMO_VIEWER_EMAIL) redirect("/m");
  if (env.KICKBACK_ENV !== "sandbox" || !env.DEMO_VIEWER_PASSWORD)
    return { error: "The read-only demo isn't set up on this deployment." };
  const { ip } = await visitor();
  if (!allowRequestPer(`demo-session:${ip}`, 10, 3600000))
    return { error: "Too many demo sessions from this network. Try again in an hour." };
  const forwarded = new Headers(await headers());
  forwarded.set(DEMO_SIGN_IN_HEADER, demoSignInToken(env.BETTER_AUTH_SECRET!));
  try {
    await auth.api.signInEmail({
      body: { email: DEMO_VIEWER_EMAIL, password: env.DEMO_VIEWER_PASSWORD },
      headers: forwarded,
    });
  } catch {
    console.error(JSON.stringify({ action: "demo_session_failed" }));
    return { error: "The read-only demo is unavailable right now. Try again in a few minutes." };
  }
  const [rosas] = await getDb()
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.slug, "rosas"));
  if (rosas)
    (await cookies()).set("kickback.merchant", rosas.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.APP_URL).protocol === "https:",
      path: "/",
    });
  redirect("/m");
}
/** Starts one real sandbox payment for a staged demo customer and opens its live page. */
export async function startWatch(): Promise<DemoState> {
  const { ip, key } = await visitor();
  if (!allowRequestPer(`demo-run:${ip}`, 3, 600000))
    return { error: "You've started several runs. Give it a few minutes." };
  const started = await startDemoRun(key);
  if (!started.ok) return { error: started.error, lastRunId: started.lastRunId };
  after(() => executeDemoRun(started.id));
  redirect(`/demo/runs/${started.id}`);
}
export type BuyerState = {
  error?: string;
  buyer?: { email: string; password: string; until: string };
};
/** Reserves a published sandbox buyer at visit 4 of 5 for this browser for 30 minutes. */
export async function getDemoBuyer(): Promise<BuyerState> {
  const { ip } = await visitor();
  if (!allowRequestPer(`demo-buyer:${ip}`, 6, 3600000))
    return { error: "Too many demo buyers from this network. Try again later." };
  const closed = await demoPaymentsUnavailable();
  if (closed) return { error: closed };
  const jar = await cookies(),
    holder = jar.get(DEMO_COOKIE)?.value ?? randomUUID();
  const buyer = await reserveBuyer("pay", "pay:" + holder);
  const password = buyer && publishedCredentials().get(buyer.email);
  if (!buyer || !password)
    return {
      error: "All demo buyers are in use right now. Try “Watch a reward happen”, or check back in a few minutes.",
    };
  jar.set(DEMO_COOKIE, holder, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getEnv().APP_URL).protocol === "https:",
    path: "/",
    maxAge: 6 * 3600,
  });
  return {
    buyer: { email: buyer.email, password, until: buyer.reservedUntil!.toISOString() },
  };
}
