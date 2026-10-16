import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { querySuffix, querySchema } from "./query";
import type { z } from "zod";
export { cohortCaption, mdeSentence } from "./measurement";
import { mdeSentence } from "./measurement";
export async function cohortQuery(
  merchant: { id: string; tz: string },
  minimum: number,
  body: z.infer<typeof querySchema>,
  now = new Date(),
) {
  const result = await getDb().execute(
    sql`with eligible as(select customer_key,started_at,source,row_number() over(partition by customer_key order by started_at,id) rn from visits where merchant_id=${merchant.id} and status='COMPLETED' and amount_cents>=${minimum} and source<>'FIXTURE' and started_at<=${now.toISOString()}::timestamptz), people as(select customer_key,min(started_at) first_at,min(started_at) filter(where rn=2) second_at,bool_or(source='REPLAY') demo from eligible group by customer_key), months as(select generate_series(date_trunc('month',${now.toISOString()}::timestamptz at time zone ${merchant.tz})-interval '11 months',date_trunc('month',${now.toISOString()}::timestamptz at time zone ${merchant.tz}),interval '1 month') as cohort_start), activation as(select min(effective_from) at time zone ${merchant.tz} activation_at from programs where merchant_id=${merchant.id} and status in ('ACTIVE','RETIRED')), rows as(select to_char(m.cohort_start,'YYYY-MM') cohort_month,count(p.customer_key)::int customers,count(*) filter(where p.second_at<=p.first_at+interval '30 days')::int returned_30,count(*) filter(where p.second_at<=p.first_at+interval '60 days')::int returned_60,count(*) filter(where p.second_at<=p.first_at+interval '90 days')::int returned_90,count(*) filter(where p.second_at<=p.first_at+interval '30 days')::numeric/nullif(count(p.customer_key),0) rate_30,count(*) filter(where p.second_at<=p.first_at+interval '60 days')::numeric/nullif(count(p.customer_key),0) rate_60,count(*) filter(where p.second_at<=p.first_at+interval '90 days')::numeric/nullif(count(p.customer_key),0) rate_90,case when m.cohort_start<date_trunc('month',a.activation_at) then 'before' else 'after' end period,coalesce(bool_or(p.demo),false) includes_demo from months m cross join activation a left join people p on date_trunc('month',p.first_at at time zone ${merchant.tz})=m.cohort_start group by m.cohort_start,a.activation_at) ${querySuffix(body, merchant.tz, now)}`,
  );
  return {
    data:
      (result as unknown as { rows?: Record<string, unknown>[] }).rows ??
      Array.from(result),
  };
}
export async function measurementSentence(merchantId: string) {
  const result = await getDb().execute(
    sql`select count(*)::int n,avg(n/3.0)::float mu,stddev_samp(n/3.0)::float sigma from(select customer_key,count(*)::int n from visits where merchant_id=${merchantId} and status='COMPLETED' and source<>'FIXTURE' and started_at>=now()-interval '90 days' and started_at<=now() group by customer_key having count(*)>=2) p`,
  );
  const r = ((
    result as unknown as { rows?: { n: number; mu: number; sigma: number }[] }
  ).rows ?? Array.from(result))[0] as { n: number; mu: number; sigma: number };
  return mdeSentence(r.n, r.mu ?? 4, r.sigma ?? 2.5, r.sigma === null);
}
