import crypto from "node:crypto";

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sha1Hex(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

export function shortHash(input: string, len = 10) {
  return sha256Hex(input).slice(0, len);
}


