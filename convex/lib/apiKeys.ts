import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";

/**
 * API key secrets look like `ssk_<48 hex chars>` (192 bits of entropy).
 * They are shown once at creation and stored only as a SHA-256 hash; the
 * entropy makes a fast hash sufficient (nothing to brute-force).
 */
export const API_KEY_SECRET_PATTERN = /^ssk_[0-9a-f]{48}$/;

export function generateApiKeySecret(): string {
  return `ssk_${bytesToHex(randomBytes(24))}`;
}

export function hashApiKeySecret(secret: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(secret)));
}

/** The identifying fragment shown in key lists: `ssk_` plus 8 chars. */
export function apiKeyDisplayPrefix(secret: string): string {
  return secret.slice(0, 12);
}
