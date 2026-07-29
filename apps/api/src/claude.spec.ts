import { describe, expect, it, vi } from "vitest";
import {
  askWeatherQuestion,
  buildSystemPrompt,
  buildUserMessage,
} from "./claude";
import { isPlainAscii, SMS_CHAR_BUDGET } from "./sms";
import type { ForecastSummary } from "./weather";

const weather: ForecastSummary = {
  fetchedAt: "2026-07-28T12:00:00.000Z",
  location: { lat: 47.5, lon: -121.8 },
  periods: [
    {
      label: "Afternoon",
      tempF: 68,
      windMph: 15,
      windDirDeg: 270,
      precipChancePct: 20,
      shortForecast: "Partly cloudy",
    },
  ],
};

describe("buildSystemPrompt", () => {
  it("is plain ASCII", () => {
    expect(isPlainAscii(buildSystemPrompt())).toBe(true);
  });

  it("instructs a character budget and grounding rules", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("300 characters");
    expect(prompt).toMatch(/never invent conditions/i);
    expect(prompt).toMatch(/no markdown/i);
  });
});

describe("buildUserMessage", () => {
  it("includes location, forecast periods, and the question", () => {
    const msg = buildUserMessage(weather, "wind loading on N aspects?");
    expect(msg).toContain("47.5,-121.8");
    expect(msg).toContain(
      "Afternoon: 68F, wind 15mph from 270deg, 20% precip chance, Partly cloudy",
    );
    expect(msg).toContain("Question: wind loading on N aspects?");
  });
});

describe("askWeatherQuestion", () => {
  function fakeClient(text: string) {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text, citations: null }],
    });
    return {
      messages: { create },
    } as unknown as import("@anthropic-ai/sdk").default;
  }

  it("calls the API with the expected model/limits and returns the reply", async () => {
    const client = fakeClient("Clear this afternoon, light wind.");
    const reply = await askWeatherQuestion(client, weather, "what's it like?");

    expect(reply).toBe("Clear this afternoon, light wind.");
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system: buildSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildUserMessage(weather, "what's it like?"),
          },
        ],
      }),
      { timeout: 8000 },
    );
  });

  it("truncates an overlong reply as a backstop", async () => {
    const long = "word ".repeat(200).trim();
    const client = fakeClient(long);

    const reply = await askWeatherQuestion(client, weather, "detail please?");

    expect(reply.length).toBeLessThanOrEqual(SMS_CHAR_BUDGET);
    expect(reply.endsWith("...")).toBe(true);
  });

  it("returns an empty string if no text block is present", async () => {
    const client = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    } as unknown as import("@anthropic-ai/sdk").default;

    expect(await askWeatherQuestion(client, weather, "?")).toBe("");
  });
});
