export const cohortCaption =
  "Describes repeat behaviour of PayPal/Venmo-paying customers. Not a measurement of the program's causal effect.";
export function mdeSentence(n: number, mu = 4, sigma = 2.5, assumed = true) {
  if (n < 10 || mu <= 0 || !Number.isFinite(mu) || !Number.isFinite(sigma))
    return "There are too few regulars for a useful lift test. We do not run a holdout.";
  const treated = Math.round(n * 0.9),
    control = n - treated;
  const mde = (2.8 * sigma * Math.sqrt(1 / treated + 1 / control)) / mu;
  return `With ${n} regulars, a 10% holdout here could only detect lifts above about ${Math.round(mde * 100)}%${assumed ? " (assumed visit variability)" : ""}. We do not run one. Field evidence for programs like this is 2–6%.`;
}
