import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
export async function lockMerchant(tx: Tx, merchantId: string) { await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${merchantId}))`); }
export async function lockCustomer(tx: Tx, merchantId: string, key: string) { await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${merchantId+":"+key}))`); }
