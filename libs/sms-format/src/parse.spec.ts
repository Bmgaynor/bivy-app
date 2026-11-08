import { describe, expect, it } from "vitest";
import { parseMessage } from "./parse";

describe("parseMessage", () => {
  it("parses the standard format", () => {
    expect(
      parseMessage("47.5,-121.8 | what should I expect this afternoon?"),
    ).toEqual({
      lat: 47.5,
      lon: -121.8,
      question: "what should I expect this afternoon?",
    });
  });

  it("tolerates extra whitespace around the pipe and commas", () => {
    expect(parseMessage("  47.5 , -121.8   |   wind loading?  ")).toEqual({
      lat: 47.5,
      lon: -121.8,
      question: "wind loading?",
    });
  });

  it("parses integer coordinates", () => {
    expect(parseMessage("47,-122 | clear today?")).toEqual({
      lat: 47,
      lon: -122,
      question: "clear today?",
    });
  });

  it("returns null when there's no pipe separator", () => {
    expect(parseMessage("hello")).toBeNull();
  });

  it("returns null when coordinates are out of range", () => {
    expect(parseMessage("200,-121.8 | wind?")).toBeNull();
    expect(parseMessage("47.5,-999 | wind?")).toBeNull();
  });

  it("returns null when the question is empty", () => {
    expect(parseMessage("47.5,-121.8 |    ")).toBeNull();
  });

  it("returns null for non-numeric coordinates", () => {
    expect(parseMessage("north,-121.8 | wind?")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseMessage("")).toBeNull();
  });
});
