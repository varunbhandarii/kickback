import { createVerify, X509Certificate } from "node:crypto";
export function crc32(raw: string) { let crc = 0xffffffff; for (const byte of Buffer.from(raw)) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1)^((crc & 1) ? 0xedb88320 : 0); } return (crc^0xffffffff) >>> 0; }
const certificates = new Map<string,{ pem: string; expires: number }>();
export function certificateUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^(api|api-m)\.(sandbox\.)?paypal\.com$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/v1\/notifications\/certs\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error("Invalid certificate URL");
  return url.href;
}
export function verifySignature(raw: string,headers: Headers,webhookId: string,pem: string) {
  if (headers.get("paypal-auth-algo") !== "SHA256withRSA") return false;
  const transmission = headers.get("paypal-transmission-id"), time = headers.get("paypal-transmission-time"), signature = headers.get("paypal-transmission-sig");
  if (!transmission || !time || !signature || !Number.isFinite(Date.parse(time)) || Date.parse(time) > Date.now()+300000) return false;
  const message = `${transmission}|${time}|${webhookId}|${crc32(raw)}`;
  return createVerify("RSA-SHA256").update(message).verify(pem,signature,"base64");
}
export async function verifyLocal(raw: string,headers: Headers,webhookId: string) {
  const url = certificateUrl(headers.get("paypal-cert-url") ?? "");
  let cached = certificates.get(url);
  if (!cached || cached.expires <= Date.now()) {
    const response = await fetch(url,{ redirect: "error",signal: AbortSignal.timeout(5000),cache: "no-store" });
    if (!response.ok || Number(response.headers.get("content-length")) > 32768) throw new Error("Certificate unavailable");
    const pem = await response.text(); if (Buffer.byteLength(pem) > 32768) throw new Error("Certificate too large");
    const cert = new X509Certificate(pem), expires = Math.min(Date.now()+3600000,Date.parse(cert.validTo));
    if (Date.parse(cert.validFrom) > Date.now() || expires <= Date.now()) throw new Error("Certificate expired");
    cached = { pem,expires }; if (certificates.size >= 16) certificates.delete(certificates.keys().next().value!); certificates.set(url,cached);
  }
  return verifySignature(raw,headers,webhookId,cached.pem);
}
