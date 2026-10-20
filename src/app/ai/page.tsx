export const metadata = { title: "How Kickback uses AI" };
import { PolicyLayout } from "@/components/policy-layout";

export default function AiPage() {
  return (
    <PolicyLayout
      title="How Kickback uses AI"
      intro={
        <p>
          Kickback uses Claude in four places: the Designer, Guard explanations, Scribe and the Analyst. Each one
          proposes or explains. Deterministic code checks the result, and nothing an AI writes can send a refund
          on its own.
        </p>
      }
      summary={[
        "Every number on a program proposal comes from the same reward engine that decides eligibility.",
        "Risk scores come from fixed signals; an explanation cannot change a score or approve a refund.",
        "Without AI access, presets, template copy and Guard keep working.",
      ]}
    >
      <h2 id="designer">Designer</h2>
      <h3 id="why-these-numbers">Why these numbers?</h3>
      <p>
        Claude proposes three sets of parameters from aggregate purchase history and your goal. The same
        deterministic reward engine used for eligibility backtests every proposal. It calculates cost, who could
        earn, first-reward timing, budget limits and break-even lift.
      </p>
      <p>
        Backtests describe past purchases. They do not establish that a reward changes future behavior. Gross
        margin and the lift slider are assumptions you can edit.
      </p>
      <p>
        Proposals exceeding 5% of qualifying revenue or a 15% refund count ratio are rejected. Revenue cost above
        3% is highlighted for review. Per-reward and budget ceilings apply independently. Synthetic and replay
        history are labeled.
      </p>
      <p>
        Every number in the explanation is checked against parameters and computed metrics. The figures displayed
        on each card come directly from the simulator. You can edit a proposed rule; it is checked and simulated
        again before activation.
      </p>
      <p>The weekly idea on your Overview comes from the same Designer and passes the same checks.</p>

      <h2 id="guard">Guard</h2>
      <p>
        Guard routes rewards using deterministic signals. An explanation cannot change a score or approve a
        refund. Merchant approval still passes customer, dispute, pause, budget and refundable-capture checks.
      </p>

      <h2 id="scribe">Scribe</h2>
      <p>
        Scribe proposes factual thank-you copy. Length, characters, links, prohibited promotional terms and
        unsupported numbers are checked in code. Fixed terms stay in place.
      </p>

      <h2 id="analyst">Analyst</h2>
      <p>
        The Analyst answers questions in the Cockpit. Relevant program rules, pseudonymous customer codes, metrics
        and chart instructions are sent to Anthropic to answer them. The Analyst cannot move money or change a
        program.
      </p>

      <h2>What AI can never do</h2>
      <ul>
        <li>Send, approve or cancel a refund.</li>
        <li>Change a risk score.</li>
        <li>Activate a program. A proposed rule is checked and simulated again, and you activate it.</li>
        <li>Put a number on a proposal card. Those come directly from the simulator.</li>
      </ul>

      <h2>Without AI</h2>
      <p>Without AI access, manual presets, template copy and Guard continue working.</p>

      <p>
        <a href="https://github.com/varunbhandarii/kickback/blob/main/docs/ai.md">
          Read the AI architecture and limitations
        </a>
      </p>
    </PolicyLayout>
  );
}
