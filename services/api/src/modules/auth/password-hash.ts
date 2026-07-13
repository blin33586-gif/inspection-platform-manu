import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";

const scrypt = promisify(scryptCallback);
export const DUMMY_PASSWORD_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$MzlI2-pQ6rDU2MUqfcY3b7nDcYaZXvb7GSu1hAI0QqDBz6-FxD9D2VxE5OigGOyP01Oy8AAnlCKmQ9pw4SON0A";

export function isScryptPasswordHash(encoded: string) {
  const [kind, saltText, hashText, extra] = encoded.split("$");
  if (kind !== "scrypt" || !saltText || !hashText || extra !== undefined) return false;
  try {
    return Buffer.from(saltText, "base64url").length >= 16 && Buffer.from(hashText, "base64url").length === 64;
  } catch {
    return false;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [kind, saltText, hashText] = encoded.split("$");
  if (kind !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Injectable()
export class PasswordVerifier {
  verify(password: string, encoded: string) {
    return verifyPassword(password, encoded);
  }
}
