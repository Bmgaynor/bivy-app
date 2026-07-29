import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowlist } from "./auth";

describe("parseAllowlist", () => {
  it("splits comma-separated E.164 numbers", () => {
    expect(parseAllowlist("+14155551234,+12065559876")).toEqual(
      new Set(["+14155551234", "+12065559876"]),
    );
  });

  it("trims whitespace around entries", () => {
    expect(parseAllowlist(" +14155551234 , +12065559876 ")).toEqual(
      new Set(["+14155551234", "+12065559876"]),
    );
  });

  it("drops empty entries", () => {
    expect(parseAllowlist("+14155551234,,")).toEqual(new Set(["+14155551234"]));
  });

  it("returns an empty set for an empty string", () => {
    expect(parseAllowlist("")).toEqual(new Set());
  });
});

describe("isAllowed", () => {
  const allowlist = parseAllowlist("+14155551234,+12065559876");

  it("returns true for a listed number", () => {
    expect(isAllowed("+14155551234", allowlist)).toBe(true);
  });

  it("returns false for an unlisted number", () => {
    expect(isAllowed("+19995551111", allowlist)).toBe(false);
  });

  it("tolerates incidental whitespace on the input number", () => {
    expect(isAllowed(" +14155551234 ", allowlist)).toBe(true);
  });

  it("returns false against an empty allowlist", () => {
    expect(isAllowed("+14155551234", parseAllowlist(""))).toBe(false);
  });
});
