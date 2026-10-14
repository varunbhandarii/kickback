import Link from "next/link";
export default function AiPage() {
  return (
    <main className="policy-shell">
      <Link href="/m/onboarding/program">← Program Designer</Link>
      <h1>Why these numbers?</h1>
      <p>
        Claude proposes three sets of parameters from aggregate purchase history
        and your goal. The same deterministic reward engine used for eligibility
        backtests every proposal. It calculates cost, who could earn,
        first-reward timing, budget limits and break-even lift.
      </p>
      <p>
        Backtests describe past purchases. They do not establish that a reward
        changes future behavior. Gross margin and the lift slider are
        assumptions you can edit.
      </p>
      <p>
        Proposals exceeding 5% of qualifying revenue or a 15% refund count ratio
        are rejected. Revenue cost above 3% is highlighted for review.
        Per-reward and budget ceilings apply independently. Synthetic and replay
        history are labeled.
      </p>
      <p>
        Every number in the explanation is checked against parameters and
        computed metrics. The figures displayed on each card come directly from
        the simulator. You can edit a proposed rule; it is checked and simulated
        again before activation.
      </p>
      <p>
        Guard routes rewards using deterministic signals. An explanation cannot
        change a score or approve a refund. Merchant approval still passes
        customer, dispute, pause, budget and refundable-capture checks.
      </p>
      <p>
        Scribe proposes factual thank-you copy. Length, characters, links,
        prohibited promotional terms and unsupported numbers are checked in
        code. Fixed terms stay in place.
      </p>
      <p>
        Without AI access, manual presets, template copy and Guard continue
        working.
      </p>
      <p>
        <a href="https://github.com/varunbhandarii/kickback/blob/main/docs/ai.md">
          Read the AI architecture and limitations
        </a>
      </p>
    </main>
  );
}
