import { generateKeyPairSync, createSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { certificateUrl, crc32, verifySignature } from "@/lib/paypal/local-verification";
describe("local webhook verification",() => {
  it("computes unsigned CRC32 against a known vector",() => expect(crc32("123456789")).toBe(3421780262));
  it("verifies the original bytes and rejects edited JSON",() => { const { privateKey,publicKey } = generateKeyPairSync("rsa",{ modulusLength: 2048 }), raw = '{ "id": "EVENT1" }', time = new Date().toISOString(); const signature = createSign("RSA-SHA256").update(`transmission|${time}|WEBHOOK1|${crc32(raw)}`).sign(privateKey,"base64"); const headers = new Headers({ "paypal-auth-algo": "SHA256withRSA","paypal-transmission-id": "transmission","paypal-transmission-time": time,"paypal-transmission-sig": signature }); const pem = publicKey.export({ type: "spki",format: "pem" }).toString(); expect(verifySignature(raw,headers,"WEBHOOK1",pem)).toBe(true); expect(verifySignature(JSON.stringify(JSON.parse(raw)),headers,"WEBHOOK1",pem)).toBe(false); expect(verifySignature(raw,headers,"OTHER",pem)).toBe(false); });
  it.each(["http://api.paypal.com/v1/notifications/certs/x","https://evil.paypal.com/v1/notifications/certs/x","https://api.paypal.com.evil.com/v1/notifications/certs/x","https://api.paypal.com/v1/notifications/certs/x?redirect=1","https://api.paypal.com:123/v1/notifications/certs/x"])("rejects certificate URL %s",(url) => expect(() => certificateUrl(url)).toThrow());
});
