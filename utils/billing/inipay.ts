import "server-only";

import { createHash } from "node:crypto";

// KG Inicis INIPay Pro 일반결제. Manual: https://manual.inicis.com/pay/pro.html
// Flow: the browser opens the payment window with signed P_* fields, INIPay
// posts the auth result to P_NEXT_URL, and the server confirms it with the
// approval API on the host named by P_IDCNAME.

// The manual lists exactly these. The approval host is built from P_IDCNAME,
// so anything else would let a forged post point the server at another host.
const IDC_NAMES = new Set(["fc", "ks", "stg"]);

export function inipayConfig() {
  const mid = process.env.INIPAY_MID?.trim();
  const hashKey = process.env.INIPAY_HASH_KEY?.trim();
  return mid && hashKey ? { mid, hashKey } : null;
}

/** P_CHKFAKE: BASE64(SHA512(P_AMT + P_OID + P_TIMESTAMP + HashKey)). */
export function chkfake(amount: number, orderId: string, timestamp: string, hashKey: string) {
  return createHash("sha512").update(`${amount}${orderId}${timestamp}${hashKey}`).digest("base64");
}

export function isIdcName(value: string): boolean {
  return IDC_NAMES.has(value);
}

/** Order ids are unique, at most 40 bytes, and safe in a URL. */
export function newOrderId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SB${stamp}${random}`;
}

export async function approvePayment(idcName: string, fields: { mid: string; authTid: string; amount: number }) {
  return postForm(idcName, "payAppl.ini", {
    P_MID: fields.mid,
    P_AUTH_TID: fields.authTid,
    P_AMT: String(fields.amount),
    P_CHARSET: "UTF-8",
  });
}

// Only for a failure while recording an approval: within 10 minutes of the
// auth TID. Ordinary refunds go through the cancel API instead.
export async function netCancelPayment(
  idcName: string,
  fields: { mid: string; hashKey: string; authTid: string; amount: number; orderId: string; reason: string },
) {
  const timestamp = String(Date.now());
  return postForm(idcName, "payNetCancel.ini", {
    P_MID: fields.mid,
    P_AUTH_TID: fields.authTid,
    P_AMT: String(fields.amount),
    P_OID: fields.orderId,
    P_CANCEL_MSG: fields.reason.slice(0, 50),
    P_TIMESTAMP: timestamp,
    P_CHKFAKE: chkfake(fields.amount, fields.orderId, timestamp, fields.hashKey),
    P_CHARSET: "UTF-8",
  });
}

async function postForm(idcName: string, endpoint: string, fields: Record<string, string>) {
  if (!isIdcName(idcName)) throw new Error(`Unknown INIPay IDC: ${idcName}`);
  const response = await fetch(`https://${idcName}paypro.inicis.com/payment/v1/rest/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: new URLSearchParams(fields),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`INIPay ${endpoint} returned HTTP ${response.status}`);
  return new URLSearchParams(await response.text());
}
