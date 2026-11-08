import { toAscii } from "./ascii";

// 3 decimal places is about 110 m: plenty for a forecast grid cell, and two
// characters per coordinate shorter than what a phone's GPS reports.
const COORD_DECIMALS = 3;

function formatCoord(value: number): string {
  // Number() drops trailing zeros ("47.600" -> "47.6") to save characters
  return String(Number(value.toFixed(COORD_DECIMALS)));
}

/**
 * Builds the `lat,lon | question` message that apps/api's parseMessage
 * accepts, in as few plain-ASCII characters as possible. Any extra context
 * (activity, elevation) belongs in the question, after the pipe; the parser
 * accepts nothing else before it.
 */
export function formatMessage(
  lat: number,
  lon: number,
  question: string,
): string {
  const cleaned = toAscii(question).replace(/\s+/g, " ").trim();
  return `${formatCoord(lat)},${formatCoord(lon)} | ${cleaned}`;
}
