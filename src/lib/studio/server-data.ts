import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { loadMerchant } from "../merchants";
import { querySchema, querySuffix } from "./query";
import type { z } from "zod";
import { cohortQuery } from "./cohorts";
import { customerStatus, rewardState } from "@/db/schema";
import { customerStatus as customerWords, rewardState as rewardWords } from "../copy";
/** A SQL CASE that turns stored enum values into the words the rest of the app shows. */
const words = (column: string, values: readonly string[], label: (v: string) => string) =>
  sql.raw(
    `case ${column}::text ${values
      .map((v) => `when '${v}' then '${label(v).replaceAll("'", "''")}'`)
      .join(" ")} else ${column}::text end`,
  );
const stateLabel = words("r.state", rewardState.enumValues, (v) => rewardWords(v).label),
  statusLabel = words("c.status", customerStatus.enumValues, (v) => customerWords(v).label);
export async function studioQuery(
  merchant: { id: string; slug: string; tz: string },
  body: z.infer<typeof querySchema>,
  now = new Date(),
) {
  const loaded = await loadMerchant(merchant.slug, true),
    minimum = loaded?.spec.minTicketCents ?? 1;
  if (body.table === "cohorts")
    return cohortQuery(merchant, minimum, body, now);
  if (body.table === "ai_usage") {
    const result = await getDb().execute(
      sql`with days as(select generate_series((${now.toISOString()}::timestamptz at time zone ${merchant.tz})::date-29,(${now.toISOString()}::timestamptz at time zone ${merchant.tz})::date,interval '1 day')::date as "day"), usage as(select (started_at at time zone ${merchant.tz})::date as "day",count(*)::int runs,sum(tool_calls)::int tool_calls,sum(tool_errors)::int tool_errors from ai_usage where merchant_id=${merchant.id} group by 1), calls as(select (created_at at time zone ${merchant.tz})::date as "day",count(*)::int turns,sum(input_tokens)::int input_tokens,sum(output_tokens)::int output_tokens,sum((input_tokens*4.0+output_tokens*20.0+cache_read_tokens*.2+cache_write_tokens*5.0)/1000000) cost,percentile_cont(.95) within group(order by latency_ms)::int p95_ms from ai_calls where merchant_id=${merchant.id} and feature='analyst' and actor_kind='owner' group by 1),rows as(select d.day::text as "day",coalesce(u.runs,0)::int runs,coalesce(c.turns,0)::int turns,coalesce(u.tool_calls,0)::int tool_calls,coalesce(u.tool_errors,0)::int tool_errors,coalesce(c.input_tokens,0)::int input_tokens,coalesce(c.output_tokens,0)::int output_tokens,coalesce(c.cost,0) cost_cents,coalesce(c.p95_ms,0)::int p95_ms from days d left join usage u on d.day=u.day left join calls c on d.day=c.day) ${querySuffix(body, merchant.tz, now)}`,
    );
    return {
      data:
        (result as unknown as { rows?: Record<string, unknown>[] }).rows ??
        Array.from(result),
    };
  }
  const base = sql`with v as (select v.*, to_char(v.started_at at time zone ${merchant.tz}, 'YYYY-MM-DD') as "day",
    to_char(v.started_at at time zone ${merchant.tz}, 'Dy') weekday,
    'Regular #' || upper(substr(v.customer_key,1,4)) customer_label,
    (v.status='COMPLETED' and v.amount_cents >= ${minimum}) qualifying,
    case when v.source in ('PAY_PAGE','WEBHOOK') then 'LIVE' else v.source::text end source_label,
    (select count(*)::int from captures c where c.visit_id=v.id and c.merchant_id=${merchant.id}) captures,
    coalesce((select string_agg(distinct c.wallet::text, ', ') from captures c where c.visit_id=v.id and c.merchant_id=${merchant.id}),'') wallet
    from visits v where v.merchant_id=${merchant.id} and v.started_at >= ${now.toISOString()}::timestamptz-interval '180 days' and v.started_at <= ${now.toISOString()}::timestamptz),
    r as (select r.*, 'Regular #' || upper(substr(r.customer_key,1,4)) customer_label from rewards r where r.merchant_id=${merchant.id})`;
  let rows;
  if (body.table === "visits")
    rows = sql`select id,customer_key,customer_label,day,started_at,weekday,amount_cents/100.0 amount,wallet,status::text status,source_label source,captures,qualifying from v`;
  else if (body.table === "rewards")
    rows = sql`select id,customer_key,customer_label,created_at,sent_at,state::text state,${stateLabel} state_label,tier::text tier,(amount_cents-offset_applied_cents)/100.0 amount,reason,guard_score,refund_id,note from r`;
  else if (body.table === "customers")
    rows = sql`select c.key,'Regular #' || upper(substr(c.key,1,4)) label,array_to_string(c.wallets,', ') wallets,c.first_seen,c.last_seen,c.status::text status,${statusLabel} status_label,
    coalesce(a.visits,0)::int visits_90d,coalesce(a.spend,0)/100.0 spend_90d,
    coalesce((c.progress_json->>'current')::numeric,0) progress_current,coalesce((c.progress_json->>'target')::numeric,${loaded?.spec.type === "VISIT_MILESTONE" ? loaded.spec.n : (loaded?.spec.spendCents ?? 0)}) progress_target,
    ${loaded?.spec.type === "VISIT_MILESTONE" ? "visits" : "spend"} progress_kind,
    coalesce((c.progress_json->>'current')::numeric / nullif((c.progress_json->>'target')::numeric,0),0) progress_pct,coalesce(a.demo,false) is_demo
    from customers c left join (select customer_key,count(*) filter(where qualifying)::int visits,coalesce(sum(amount_cents) filter(where qualifying),0) spend,bool_or(source in ('FIXTURE','REPLAY')) demo from v where started_at >= ${now.toISOString()}::timestamptz-interval '90 days' group by customer_key) a on a.customer_key=c.key where c.merchant_id=${merchant.id}`;
  else
    rows = sql`select d.day::text as "day",coalesce(a.visits,0)::int visits,coalesce(a.q,0)::int qualifying_visits,coalesce(a.customers,0)::int customers,coalesce(a.revenue,0)/100.0 revenue,coalesce(b.paid,0)::int rewards_paid,coalesce(b.cost,0)/100.0 reward_cost,coalesce(h.held,0)::int held,coalesce(a.demo,0)::int demo_visits
    from (select generate_series((${now.toISOString()}::timestamptz at time zone ${merchant.tz})::date-179,(${now.toISOString()}::timestamptz at time zone ${merchant.tz})::date,interval '1 day')::date as "day") d
    left join (select day,count(*) filter(where status='COMPLETED') visits,count(*) filter(where qualifying) q,count(distinct customer_key) filter(where status='COMPLETED') customers,sum(amount_cents) filter(where status='COMPLETED') revenue,count(*) filter(where source in ('FIXTURE','REPLAY') and status='COMPLETED') demo from v group by day) a on a.day=d.day::text
    left join (select (sent_at at time zone ${merchant.tz})::date as "day",count(*) paid,sum(amount_cents-offset_applied_cents) cost from r where state in ('SENT','CONFIRMED') group by 1) b on b.day=d.day
    left join (select (created_at at time zone ${merchant.tz})::date as "day",count(*) held from r where state in ('HELD','FAILED') group by 1) h on h.day=d.day`;
  const result = await getDb().execute(
    sql`${base}, rows as (${rows}) ${querySuffix(body, merchant.tz, now)}`,
  );
  const returned = result as unknown as { rows?: Record<string, unknown>[] };
  return { data: returned.rows ?? Array.from(result) };
}
