export interface ParsedMessage {
  lat: number;
  lon: number;
  question: string;
}

// "47.5,-121.8 | what should I expect this afternoon?"
const MESSAGE_PATTERN =
  /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*$/;

function isValidLat(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

function isValidLon(lon: number): boolean {
  return lon >= -180 && lon <= 180;
}

/**
 * Pure parser for the `lat,lon | question` SMS message format.
 * Returns null on anything that doesn't match — callers should reply with a
 * usage hint rather than treating this as an error.
 */
export function parseMessage(body: string): ParsedMessage | null {
  const match = MESSAGE_PATTERN.exec(body);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  const question = match[3].trim();

  if (!isValidLat(lat) || !isValidLon(lon) || question.length === 0) {
    return null;
  }

  return { lat, lon, question };
}
