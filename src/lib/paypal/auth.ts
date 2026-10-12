export function authAssertion(partnerClientId: string, merchantId: string) {
  return `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64")}.${Buffer.from(JSON.stringify({ iss: partnerClientId, payer_id: merchantId })).toString("base64")}.`;
}
