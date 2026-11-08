// SMS segments are 160 chars (70 with any Unicode); we budget for two plain-ASCII
// segments and enforce it server-side as a backstop on top of prompt instructions.
export const SMS_CHAR_BUDGET = 300;

// Shared with apps/web's composer; re-exported so existing imports keep working.
export { isPlainAscii } from "@bivy-app/sms-format";

/**
 * Word-boundary-safe truncation to `budget` characters, appending "..." when
 * cut. Never slices mid-word.
 */
export function truncateToBudget(
  s: string,
  budget: number = SMS_CHAR_BUDGET,
): string {
  if (s.length <= budget) return s;

  const suffix = "...";
  const sliceLen = Math.max(0, budget - suffix.length);
  const truncated = s.slice(0, sliceLen);
  const lastSpace = truncated.lastIndexOf(" ");
  const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut}${suffix}`;
}

export const USAGE_HINT =
  "Text: lat,lon | your question (e.g. 47.5,-121.8 | wind loading this afternoon?)";

// Reply to HELP/INFO. Toll-free verification expects HELP to return contact
// info; STOP is handled by Twilio itself and never reaches the handler.
export const HELP_REPLY =
  "Bivy: text lat,lon | question. Help: bivy@bradgaynor.com. Info: bradgaynor.com/bivy-app/index.html. Reply STOP to opt out.";

export function isHelpRequest(body: string): boolean {
  return /^(help|info)$/i.test(body.trim());
}

export const FORECAST_UNAVAILABLE =
  "Couldn't reach the forecast right now. Try again shortly.";
