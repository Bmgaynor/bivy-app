import { describe, expect, it } from "vitest";
import { isPlainAscii, toAscii } from "./ascii";
import { formatMessage } from "./format";
import { parseMessage } from "./parse";

describe("toAscii", () => {
  it("maps iOS smart punctuation back to ASCII", () => {
    expect(toAscii("what’s the “wind” — and rain…")).toBe(
      'what\'s the "wind" - and rain...',
    );
  });

  it("drops emoji and strips accents", () => {
    expect(toAscii("snow ❄️ near Château")).toBe("snow  near Chateau");
  });
});

describe("formatMessage", () => {
  it("rounds coordinates to 3 decimals and drops trailing zeros", () => {
    expect(formatMessage(47.60012345, -121.80049, "wind tonight?")).toBe(
      "47.6,-121.8 | wind tonight?",
    );
    expect(formatMessage(46.85234, -121.76049, "rain?")).toBe(
      "46.852,-121.76 | rain?",
    );
  });

  it("collapses whitespace and trims the question", () => {
    expect(formatMessage(1, 2, "  wind \n loading\ton N  ")).toBe(
      "1,2 | wind loading on N",
    );
  });

  it("always produces text the server parser accepts, in plain ASCII", () => {
    const cases: [number, number, string][] = [
      [47.6, -121.8, "wind and rain tonight?"],
      [-33.86, 151.21, "what’s the freezing level — tomorrow?"],
      [0, 0, "ski 8k: wind loading on N aspects?"],
      [89.9999, -179.9999, "storms 🌩️ after 2pm?"],
    ];
    for (const [lat, lon, question] of cases) {
      const message = formatMessage(lat, lon, question);
      expect(isPlainAscii(message)).toBe(true);
      const parsed = parseMessage(message);
      expect(parsed).not.toBeNull();
      expect(parsed?.lat).toBeCloseTo(lat, 2);
      expect(parsed?.lon).toBeCloseTo(lon, 2);
    }
  });
});
