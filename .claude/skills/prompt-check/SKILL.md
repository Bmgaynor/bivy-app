---
name: prompt-check
description: Use when iterating on the Claude weather-assistant system prompt in apps/api/src/claude.ts — runs it against fixture weather-JSON + question pairs and checks the reply is plain ASCII, has no markdown, and stays under the ~300 character / 2-segment SMS budget. Use before considering a system-prompt change "done."
---

# Prompt quality check

The plan calls the system prompt "where the quality lives" — this skill makes iterating on it fast instead of manual character-counting.

## What to verify per reply

1. **Length** — ≤300 characters (2 SMS segments). Flag anything over.
2. **Encoding** — plain ASCII only. Any smart quotes, em dashes, or emoji silently drop the segment size from 160 to 70 chars — treat these as failures, not style nits.
3. **No markdown** — no `**bold**`, bullet points, or headers. SMS renders it as literal characters.
4. **Grounded** — the answer only states facts present in the supplied weather JSON; it never invents conditions.
5. **Leads with the actionable fact** — not a preamble like "Based on the forecast...".

## How to run it

1. Maintain the fixture set at `apps/api/fixtures/prompt-cases.json`: pairs of `{ weather: <sample forecast JSON>, question: <string> }` covering a few conditions (clear, storm incoming, high wind, ambiguous question).
2. Run `ANTHROPIC_API_KEY=... nx run api:check-prompts` (executes `apps/api/scripts/check-prompts.ts`, which imports `buildSystemPrompt`/`buildUserMessage`/`askWeatherQuestion` directly from `apps/api/src/claude.ts` and calls each fixture against the live Anthropic API — no Twilio/HTTP needed, and no local emulator required either).
3. Check each reply against the 5 criteria above (the script automates length/ASCII/no-markdown; grounded and leads-with-fact are still a human read of the printed output).
4. When changing the system prompt, rerun the full fixture set — a fix for one case can regress another (e.g. terser instructions can start dropping units or leading with caveats).

## Notes

- Do this locally before wiring the handler (checklist step 4, before step 5) — much faster than testing via real SMS round-trips.
- If truncation is needed as a backstop, verify it doesn't cut off mid-sentence or mid-word.
- `check-prompts` is a standalone `nx:run-commands` target on the `api` project, deliberately *not* included in `nx affected -t lint,test,build` or in CI — it hits the live Anthropic API and costs real tokens per run. See the `nx-affected-check` skill for why it's excluded from the default target set.
