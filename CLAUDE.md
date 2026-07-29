# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bivy — a text-in/text-out backcountry weather assistant. Users SMS a Twilio number
with `lat,lon | question`; a stateless Firebase Function fetches live weather, hands
it to Claude, and texts back a short answer via the Twilio REST API. Designed to work
over Apple's satellite messaging when off-grid.

The full phased plan lives in `satellite-weather-assistant-plan.md` — read it before
starting work. It defines the guiding constraints (scale-to-zero, free-tier-first,
stateless, allowlist-gated), the phase sequence, environment variables, message
format, and the ordered Phase 1 checklist. Treat it as the source of truth for scope
and sequencing; don't jump ahead to a later phase without checking it first.

**Phase 1.5 gates Phase 3.** Do not build the SendBlue/iMessage integration until
the satellite-SMS field test (Phase 1.5 in the plan) has actually been run — it may
make Phase 3 unnecessary entirely.

## Architecture

This is an **Nx monorepo** (`nx@22.3.3`, pinned to match `@simondotm/nx-firebase`'s
peer range). Two projects:

- **`apps/bivy`** — the Firebase "app" container: owns `firebase.json`, `.firebaserc`,
  and `environment/` (secret/env files for local emulation). No application logic.
- **`apps/api`** — the Firebase Function ("codebase" name `api`). All Phase 1 logic
  lives here. The deployed HTTPS endpoint is named **`sms`** (the exported symbol in
  `main.ts`), not `api` — don't confuse the codebase name with the function name when
  constructing URLs.

Inside `apps/api/src/`:
- `main.ts` — thin `onRequest` handler: verify → allowlist → parse → weather → claude → send.
- `messaging/types.ts` + `messaging/twilio.ts` — `MessagingProvider` interface and its
  Twilio implementation. Replies go out via the Twilio **REST API** (`send()`), not
  inline TwiML — this is what would let a conditional future SendBlue swap (Phase 3)
  be a new sibling file instead of a rewrite of `main.ts`.
- `weather.ts` — Open-Meteo provider; `parseOpenMeteoResponse` is pure and
  fixture-tested, `createOpenMeteoProvider` is the impure fetch wrapper.
- `claude.ts` — prompt construction + the Anthropic API call (`claude-haiku-4-5`).
- `auth.ts`, `parse.ts`, `sms.ts` — pure helpers (allowlist, message-format parsing,
  SMS character-budget/ASCII/truncation).
- `config.ts` — `firebase-functions/params` secret/string bindings.

`apps/web` (Phase 2 SPA) and `libs/*` (Phase 4 shared trip schema) don't exist yet —
see the `nx-generate-project` skill for how to add them when that work starts.

## Commands

```bash
nx serve bivy          # local dev: esbuild watch + Firebase Emulator Suite
nx test api             # vitest
nx lint api              # biome check apps/api
nx build api            # esbuild bundle to dist/apps/api
nx run api:check-prompts  # prompt-quality tool against live Anthropic API (see prompt-check skill)
npx nx affected -t lint,test,build   # only re-verify what changed (see nx-affected-check skill)
```

Secrets for local emulation live in `apps/bivy/environment/.secret.local`
(git-ignored). Production secrets are Secret Manager values set via
`firebase functions:secrets:set <NAME>` — never passed through GitHub Actions.

## Skills

- `twilio-dev-loop` — local Twilio webhook testing loop (`nx serve bivy` + ngrok +
  round-trip SMS test). Use while iterating on the message-handling path.
- `prompt-check` — validates the Claude system prompt's output against fixtures:
  ASCII-only, no markdown, ≤300 chars, grounded in the supplied weather data. Use
  while iterating on the system prompt.
- `nx-affected-check` — run before committing: `nx affected -t lint,test,build`.
- `nx-generate-project` — exact generator commands for future `apps/web` (Phase 2)
  and `libs/*` (Phase 4).

## Status

Phase 1 (POC) implementation is built: all `apps/api/src/*` modules, tests, and the
GitHub Actions deploy workflow are in place. Remaining before it's live per the
plan's "Phase 1 Entry Point" checklist: Twilio trial account setup, a real GCP/Firebase
project (`.firebaserc` + `apps/bivy/project.json`'s `firebase` target still need the
real project ID), `firebase functions:secrets:set` for the five secrets, and the
`GCP_SA_KEY` GitHub secret — then deploy and run the Phase 1.5 satellite field test.
