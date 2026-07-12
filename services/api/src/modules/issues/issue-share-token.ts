import { createHash, createHmac, randomBytes } from "node:crypto";

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createShareToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function deriveIssueShareToken(issueId: string, secret: string) {
  return createHmac("sha256", secret).update(issueId).digest("base64url");
}
