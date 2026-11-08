// Pure helpers for the composer: no React, no DOM beyond the Storage passed in.

/** One SMS segment in GSM-7. Satellite messaging is slow; one segment is ideal. */
export const SEGMENT_CHARS = 160;

export interface Template {
  label: string;
  text: string;
}

// Short on purpose: every character is sent over satellite. Context such as
// activity or elevation goes in the question; the server parses nothing else.
export const BUILT_IN_TEMPLATES: Template[] = [
  { label: "Wind", text: "wind next 12h?" },
  { label: "Rain/snow", text: "rain or snow next 24h?" },
  { label: "Freezing level", text: "freezing level today and tomorrow?" },
  { label: "Storms", text: "thunderstorm risk this afternoon?" },
  { label: "Overnight", text: "overnight low and wind?" },
  { label: "Best window", text: "best window to move in the next 24h?" },
];

export interface Coords {
  lat: number;
  lon: number;
}

/** Accepts "47.6, -121.8", "47.6 -121.8" or "47.6,-121.8"; null otherwise. */
export function parseCoordInput(input: string): Coords | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
    input,
  );
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/**
 * Turns what people type ("(800) 555-1234", "1 800 555 1234") into E.164.
 * Ten digits are assumed to be a US/Canada number. Returns null if invalid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let e164 = digits;
  if (/^\d{10}$/.test(digits)) e164 = `+1${digits}`;
  else if (/^1\d{10}$/.test(digits)) e164 = `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/**
 * `sms:` link with the body prefilled. The `?&body=` form is the one both iOS
 * Messages and Android accept.
 */
export function buildSmsHref(number: string, body: string): string {
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
}

// ---------- Storage: per-device settings, never sent anywhere ----------

const KEYS = {
  number: "bivy.number",
  templates: "bivy.templates",
  lastCoords: "bivy.lastCoords",
} as const;

export interface SavedState {
  number: string | null;
  templates: Template[];
  lastCoords: string;
}

// Storage can be missing or throw (private browsing, iOS eviction); the app
// must still work without it, just without remembering anything.
function read(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore: remembering is a convenience
  }
}

export function loadState(storage: Storage | undefined): SavedState {
  let templates: Template[] = [];
  try {
    const parsed = JSON.parse(read(storage, KEYS.templates) ?? "[]");
    if (Array.isArray(parsed)) {
      templates = parsed.filter(
        (t): t is Template =>
          typeof t?.label === "string" && typeof t?.text === "string",
      );
    }
  } catch {
    templates = [];
  }
  return {
    number: read(storage, KEYS.number),
    templates,
    lastCoords: read(storage, KEYS.lastCoords) ?? "",
  };
}

export function saveNumber(storage: Storage | undefined, number: string) {
  write(storage, KEYS.number, number);
}

export function saveTemplates(
  storage: Storage | undefined,
  templates: Template[],
) {
  write(storage, KEYS.templates, JSON.stringify(templates));
}

export function saveLastCoords(storage: Storage | undefined, coords: string) {
  write(storage, KEYS.lastCoords, coords);
}
