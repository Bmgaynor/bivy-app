import { describe, expect, it } from "vitest";
import {
  FORECAST_UNAVAILABLE,
  HELP_REPLY,
  isHelpRequest,
  isPlainAscii,
  SMS_CHAR_BUDGET,
  truncateToBudget,
  USAGE_HINT,
} from "./sms";

describe("isPlainAscii", () => {
  it("accepts plain ASCII text", () => {
    expect(isPlainAscii("Clear this afternoon, 15mph NW wind.")).toBe(true);
  });

  it("rejects smart quotes and em dashes", () => {
    expect(isPlainAscii("It’s clear — light wind.")).toBe(false);
  });

  it("rejects emoji", () => {
    expect(isPlainAscii("Sunny today ☀️")).toBe(false);
  });

  it("accepts an empty string", () => {
    expect(isPlainAscii("")).toBe(true);
  });
});

describe("truncateToBudget", () => {
  it("returns short strings unchanged", () => {
    expect(truncateToBudget("short reply", 300)).toBe("short reply");
  });

  it("truncates at a word boundary and appends ...", () => {
    const long = "word ".repeat(100).trim();
    const result = truncateToBudget(long, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith("...")).toBe(true);
    expect(result.endsWith(" ...")).toBe(false);
  });

  it("never cuts mid-word when a space exists before the limit", () => {
    const result = truncateToBudget("abcdefgh ijklmnop qrstuvwx", 15);
    expect(result).toBe("abcdefgh...");
  });

  it("falls back to a hard cut when there's no earlier space", () => {
    const result = truncateToBudget("a".repeat(50), 10);
    expect(result).toBe(`${"a".repeat(7)}...`);
  });

  it("defaults to SMS_CHAR_BUDGET", () => {
    const long = "x".repeat(SMS_CHAR_BUDGET + 50);
    expect(truncateToBudget(long).length).toBeLessThanOrEqual(SMS_CHAR_BUDGET);
  });
});

describe("stock messages", () => {
  it("are plain ASCII and within budget", () => {
    for (const msg of [USAGE_HINT, FORECAST_UNAVAILABLE]) {
      expect(isPlainAscii(msg)).toBe(true);
      expect(msg.length).toBeLessThanOrEqual(SMS_CHAR_BUDGET);
    }
  });
});

describe("isHelpRequest", () => {
  it("matches HELP and INFO in any case, ignoring surrounding space", () => {
    for (const body of ["HELP", "help", " Help ", "INFO", "info"]) {
      expect(isHelpRequest(body)).toBe(true);
    }
  });

  it("doesn't match questions that mention help", () => {
    expect(isHelpRequest("47.5,-121.8 | help me pick a camp")).toBe(false);
    expect(isHelpRequest("helpful")).toBe(false);
  });
});

describe("HELP_REPLY", () => {
  it("is plain ASCII and fits one 160-char segment", () => {
    expect(isPlainAscii(HELP_REPLY)).toBe(true);
    expect(HELP_REPLY.length).toBeLessThanOrEqual(160);
  });
});
