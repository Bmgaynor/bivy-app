/**
 * Standalone prompt-quality tool. Hits the live Anthropic API — costs real
 * tokens, not deterministic, not part of `nx test`/CI. Run with:
 *   ANTHROPIC_API_KEY=... nx run api:check-prompts
 * See the `prompt-check` skill for what to look for in the output.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { askWeatherQuestion } from "../src/claude";
import { isPlainAscii, SMS_CHAR_BUDGET } from "../src/sms";
import type { ForecastSummary } from "../src/weather";

interface PromptCase {
  name: string;
  question: string;
  weather: ForecastSummary;
}

const MARKDOWN_PATTERN = /(\*\*|__|^#|^- |^\* |\[.*\]\(.*\))/m;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY before running this script.");
    process.exit(1);
  }

  const fixturesPath = join(__dirname, "../fixtures/prompt-cases.json");
  const cases: PromptCase[] = JSON.parse(readFileSync(fixturesPath, "utf-8"));

  const client = new Anthropic({ apiKey });
  let failures = 0;

  for (const testCase of cases) {
    const reply = await askWeatherQuestion(
      client,
      testCase.weather,
      testCase.question,
    );

    const checks = {
      length: reply.length <= SMS_CHAR_BUDGET,
      ascii: isPlainAscii(reply),
      noMarkdown: !MARKDOWN_PATTERN.test(reply),
    };
    const allPassed = Object.values(checks).every(Boolean);
    if (!allPassed) failures += 1;

    console.log(`\n--- ${testCase.name} (${allPassed ? "PASS" : "FAIL"}) ---`);
    console.log(`Q: ${testCase.question}`);
    console.log(`A: ${reply}`);
    console.log(
      `length=${reply.length}/${SMS_CHAR_BUDGET} ascii=${checks.ascii} noMarkdown=${checks.noMarkdown}`,
    );
    console.log(
      "Judgment calls to eyeball: grounded in the data above? leads with the fact?",
    );
  }

  console.log(
    `\n${cases.length - failures}/${cases.length} passed automated checks.`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
