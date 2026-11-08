import { describe, expect, it } from "vitest";
import {
  buildSmsHref,
  loadState,
  normalizePhone,
  parseCoordInput,
  saveNumber,
  saveTemplates,
} from "./compose";

describe("parseCoordInput", () => {
  it("accepts comma or space separated coordinates", () => {
    expect(parseCoordInput("47.6, -121.8")).toEqual({ lat: 47.6, lon: -121.8 });
    expect(parseCoordInput(" 47.6 -121.8 ")).toEqual({
      lat: 47.6,
      lon: -121.8,
    });
    expect(parseCoordInput("47,-121")).toEqual({ lat: 47, lon: -121 });
  });

  it("rejects out-of-range or malformed input", () => {
    expect(parseCoordInput("91, 0")).toBeNull();
    expect(parseCoordInput("0, 181")).toBeNull();
    expect(parseCoordInput("Mt Rainier")).toBeNull();
    expect(parseCoordInput("")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("normalizes common US formats to E.164", () => {
    expect(normalizePhone("(800) 555-1234")).toBe("+18005551234");
    expect(normalizePhone("1 800 555 1234")).toBe("+18005551234");
    expect(normalizePhone("+1 800-555-1234")).toBe("+18005551234");
  });

  it("rejects numbers that are too short", () => {
    expect(normalizePhone("555-1234")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("buildSmsHref", () => {
  it("prefills an encoded body in the form iOS and Android accept", () => {
    expect(buildSmsHref("+18005551234", "47.6,-121.8 | wind & rain?")).toBe(
      "sms:+18005551234?&body=47.6%2C-121.8%20%7C%20wind%20%26%20rain%3F",
    );
  });
});

describe("storage", () => {
  function memoryStorage(): Storage {
    const data = new Map<string, string>();
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
  }

  it("round-trips the number and custom templates", () => {
    const storage = memoryStorage();
    saveNumber(storage, "+18005551234");
    saveTemplates(storage, [{ label: "Ski", text: "wind loading on N?" }]);
    expect(loadState(storage)).toEqual({
      number: "+18005551234",
      templates: [{ label: "Ski", text: "wind loading on N?" }],
      lastCoords: "",
    });
  });

  it("works with no storage or storage that throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(loadState(undefined).number).toBeNull();
    expect(loadState(throwing).templates).toEqual([]);
    expect(() => saveNumber(throwing, "+18005551234")).not.toThrow();
  });

  it("ignores corrupt saved templates", () => {
    const storage = memoryStorage();
    storage.setItem("bivy.templates", "{not json");
    expect(loadState(storage).templates).toEqual([]);
  });
});
