import type { AgDefaultRegistry, AgDefaultWidgetDefinition } from "ag-studio";
import {
  createWidgets,
  type AgWidgetDefinition,
  type AgAiToolDisplay,
} from "ag-studio-react";
import { rewardFunnel, type RewardFunnelDef } from "./reward-funnel";
import { customerLedger, type LedgerDef } from "./customer-ledger";
export interface KickbackRegistry extends Omit<
  AgDefaultRegistry,
  "widgets" | "aiToolDisplay"
> {
  aiToolDisplay: AgAiToolDisplay;
  widgets: readonly (
    | AgDefaultWidgetDefinition
    | AgWidgetDefinition<"reward-funnel", RewardFunnelDef>
    | AgWidgetDefinition<"customer-ledger", LedgerDef>
  )[];
}
export const cockpitWidgets = createWidgets<KickbackRegistry>({
  additionalTypes: [rewardFunnel, customerLedger],
  menu: [
    { label: "Kickback", widgetIds: ["reward-funnel", "customer-ledger"] },
  ],
});
