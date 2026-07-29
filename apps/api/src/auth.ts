/**
 * Provider-agnostic allowlist check. Signature/webhook-authenticity
 * validation is provider-specific and lives in messaging/twilio.ts's
 * `verify()` instead — this module only decides who's allowed to get a
 * reply once a message is known to be genuine.
 */
export function parseAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

export function isAllowed(from: string, allowlist: Set<string>): boolean {
  return allowlist.has(from.trim());
}
