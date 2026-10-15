export const sourceFields = {
  customers: {
    key: "text",
    label: "text",
    wallets: "text",
    first_seen: "datetime",
    last_seen: "datetime",
    visits_90d: "integer",
    spend_90d: "currency",
    progress_current: "integer",
    progress_target: "integer",
    progress_kind: "text",
    progress_pct: "percentage",
    status: "text",
    is_demo: "boolean",
  },
  visits: {
    id: "text",
    customer_key: "text",
    customer_label: "text",
    day: "date",
    started_at: "datetime",
    weekday: "text",
    amount: "currency",
    wallet: "text",
    status: "text",
    source: "text",
    captures: "integer",
    qualifying: "boolean",
  },
  rewards: {
    id: "text",
    customer_key: "text",
    customer_label: "text",
    created_at: "datetime",
    sent_at: "datetime",
    state: "text",
    tier: "text",
    amount: "currency",
    reason: "text",
    guard_score: "integer",
    refund_id: "text",
    note: "text",
  },
  daily_summary: {
    day: "date",
    visits: "integer",
    qualifying_visits: "integer",
    customers: "integer",
    revenue: "currency",
    rewards_paid: "integer",
    reward_cost: "currency",
    held: "integer",
    demo_visits: "integer",
  },
} as const;
export type StudioTable = keyof typeof sourceFields;
export const tableDescriptions: Record<StudioTable, string> = {
  customers:
    "Recognized wallets at this business. Codes are pseudonymous. Progress uses the active program; synthetic customers have no live reward progress.",
  visits:
    "Visits in the last 180 days. Purchases in the merge window form one visit. LIVE means pay page or webhook. REPLAY and FIXTURE are explicitly demo history; BACKFILL is imported history.",
  rewards:
    "All program rewards, partial refunds of qualifying purchases. Amount is net of offsets. No financial actions are available here.",
  daily_summary:
    "One row per local day over 180 days, including zeros. Visits count completed visits; qualifying visits also meet the active minimum. Reward costs use the sent date. Demo visits are labeled.",
};
