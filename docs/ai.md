# Program Designer, Guard and Scribe

Kickback uses Claude to propose rules and write explanations and thank-you copy. The default model is `claude-opus-5-5`. AI output is checked in code; it cannot activate a program, resolve a dispute, approve a reward or call a payment API.

## Designer

The merchant provides a goal, monthly reward budget and gross-margin assumption. Claude receives aggregate history: visit and gap distributions, ticket quantiles, weekday and wallet mixes, current rule parameters and category priors. Customer keys, provider account IDs, contacts, raw transaction responses and credentials are excluded.

The pipeline proposes three diverse parameter sets, validates them, backtests them with the deterministic reward engine, then asks Claude to explain the computed results. Every number in the explanation must match an allowed formatting of that candidate's parameters or metrics. Unsupported prose is regenerated once, then replaced with a template. Cards always display figures directly from metrics.

The simulator reports 90-day cost, normalized monthly cost, earners, share reaching a reward, median time to first reward, refund-count ratio, reward cost as a share of qualifying revenue, heavy-buyer reward share, blocked milestones and break-even lift. Blocked milestones remain consumed, matching live eligibility. At a gross margin of `m`, break-even lift is `reward cost / qualifying revenue / m`. The lift slider is an assumption, not a measured effect.

Local ceilings enforce reward amounts of $1–$25, visit targets of 2–20, windows of 14–365 days, minimum tickets, merchant budgets and per-customer caps. A spending target must cover at least three median tickets and five rewards. Reward divided by qualifying spend may not exceed 12% for cafes/bakeries or 8% for salons/other categories. These are conservative design policies, not guarantees of profitability.

Simulated revenue cost above 5% or refund count above 15% rejects the proposal. Above 3% revenue cost, above 10% refund count, concentration among heavy buyers, low reach or slow cafe/bakery rewards produce warnings. Sparse histories remain explicitly limited.

Selecting **Use this** prefills an editable form. Activation loads the tenant's server-stored draft, validates and simulates edits again, and records the original candidates, metrics, goal, assumptions, model, prompt version, call IDs, edits, approver and approval time. Only this owner action creates an active program version.

## Guard

Guard is deterministic. It scores merged-payment patterns, repeated visits, new-customer velocity, ticket anomalies, prior clawbacks/holds, reward frequency, near-minimum tickets and unusually high daily budget use. Scores below 30 stay instant; 30–59 wait 24 hours; 60 or more require review. The program's settlement setting is the minimum delay.

Review approval schedules the existing reward through the normal executor. Customer status, disputes, connection, pause switches, budgets and capture availability still apply. Declining keeps the cycle consumed and restores any clawback debit applied to the declined reward. Approval and decline are tenant-scoped and idempotent.

In-app notices summarize refund/revenue ratios, budget burn, old reviews and frozen customers. An optional AI explanation cannot change the score or decision. A proposed rule change is only a form prefill for owner review.

## Scribe

Scribe proposes six note variants, a terms introduction, two worked examples and a short sign pitch. The business voice is untrusted input. Notes must contain the exact business name and milestone, fit 120 characters, contain no links/newlines, and pass character, promotional-language and number checks. Other copy has its own length limits and must quote only supplied rule numbers.

An approved reward chooses a variant deterministically from its persisted reward ID, so retries keep the same note. Fixed eligibility, partial-refund, cap, dispute, tax/fee and opt-out clauses remain in the terms page. Generated copy is public only after owner activation.

## Synthetic history and fallbacks

Sandbox demo businesses can use clearly labeled synthetic history for design. Fixture customers are excluded, visits are ignored by live eligibility, captures have zero refundable value, and fixture IDs/orders are rejected by the executor, including uncertain-send recovery. Clearing fixtures leaves real purchases intact. Replay visit dates are also labeled; provider capture timestamps are preserved.

Without an API key, with `AI_ENABLED=false`, or after a refusal, timeout, quota, API or validation error, manual presets, template copy and deterministic Guard continue working. Every call reserves a durable per-merchant daily slot before requesting Claude. The default limit is 30 calls per UTC day. Usage logs include tokens, caching, latency and provider request ID; prompts and raw model responses are not logged.

Weekly suggestions require at least 20 real qualifying visits in 30 days. A leased background task stores at most one pending idea per merchant, with a cooldown after failure. Suggestions never apply automatically. Introductory progress is optional for a new customer's first visit cycle; at least two actual visits are required and later cycles start at zero.

Read-only analyst tools expose simulation, derived customer facts, risk flags, program metrics and design proposals. Each request validates its schema and the authenticated merchant scope. None exposes money actions.

References: [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [adaptive thinking and model migration](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide), [pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Analyst

The Cockpit Analyst answers from the current business's Studio queries and five scoped tools: program metrics, risk flags, customer progress, rule simulation and design proposals. Customer codes are pseudonyms; hidden join keys are not names or contact data. Synthetic and replay history is labeled in results and summaries. Retrospective costs and lift assumptions are not predictions.

Claude streams through a server endpoint with session/owner checks, a separate daily turn quota (default 80), cancellation and usage logging. The configured model and secret key remain server-side. A question can require multiple turns. Signed assistant tool-turn content is cached per business for up to 24 hours; recent conversations expire after 30 idle days and are capped at 20 per business.

The Analyst can delegate chart layout to Studio agents. It cannot approve or decline rewards, execute refunds, contact customers, resolve disputes or activate rules. New design proposals require confirmation and use the existing design quota. When AI is disabled or unavailable, the charts, presets, deterministic Guard and ordinary merchant controls remain available.

## Copy, inline results and honest measurement

Newly activated thank-you notes and welcome-back copy require the literal phrase “loyalty reward”; approved existing versions are retained until the owner reviews and activates a replacement. Validation also checks business name, milestone, allowed numbers, length and prohibited promotional wording.

The Analyst can read twelve monthly first-visit cohorts with cohort_metrics, set the KPI date window, and arrange custom widgets on Loyalty or Risk. Inline results show backtest figures and a bounded regular ledger. Cohorts exclude fixture-only history and label replay history. Their caption states that repeat behaviour is descriptive, not a measurement of causal program effect; recent cohorts have incomplete follow-up. A calculated holdout detection limit is informational; Kickback runs no holdout.

Usage cards combine count-only browser telemetry with authoritative server token/cost records. No prompts, tool arguments or result bodies are included in that telemetry. Conversations have their separate retention lifecycle.
