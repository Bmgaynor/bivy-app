import type Anthropic from "@anthropic-ai/sdk";
import { truncateToBudget } from "./sms";
import type { ForecastSummary } from "./weather";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 200;
const REQUEST_TIMEOUT_MS = 8000;

export function buildSystemPrompt(): string {
  return [
    "You are a terse backcountry weather assistant reachable only by SMS.",
    "The weather data in the user message is authoritative and current for the",
    "requested location - never invent conditions that are not present in it.",
    "Reply in under 300 characters of plain ASCII text only: no markdown, no",
    "emoji, no smart quotes or em dashes. Lead with the actionable fact, not a",
    'preamble like "Based on the forecast...".',
    "This is decision support, not a safety guarantee - never state or imply",
    "that a route or activity is safe.",
  ].join(" ");
}

export function buildUserMessage(
  weather: ForecastSummary,
  question: string,
): string {
  const periodLines = weather.periods.map(
    (p) =>
      `${p.label}: ${p.tempF}F, wind ${p.windMph}mph from ${p.windDirDeg}deg, ${p.precipChancePct}% precip chance, ${p.shortForecast}`,
  );

  return [
    `Location: ${weather.location.lat},${weather.location.lon}`,
    `Forecast fetched: ${weather.fetchedAt}`,
    ...periodLines,
    `Question: ${question}`,
  ].join("\n");
}

function isTextBlock(
  block: Anthropic.ContentBlock,
): block is Anthropic.TextBlock {
  return block.type === "text";
}

export async function askWeatherQuestion(
  client: Anthropic,
  weather: ForecastSummary,
  question: string,
): Promise<string> {
  const response = await client.messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        { role: "user", content: buildUserMessage(weather, question) },
      ],
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const textBlock = response.content.find(isTextBlock);
  const reply = textBlock?.text.trim() ?? "";
  return truncateToBudget(reply);
}
