# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bivy — a text-in/text-out backcountry weather assistant. Users SMS a Twilio number
with `lat,lon | question`; a stateless webhook server fetches live weather, hands it
to Claude, and texts back a short answer via the Twilio REST API. Designed to work
over Apple's satellite messaging when off-grid.

The full phased plan lives in `satellite-weather-assistant-plan.md` — read it before
starting work. It defines the guiding constraints (no hosting bill, free-tier-first,
stateless, allowlist-gated), the phase sequence, environment variables, message
format, and the ordered Phase 1 checklist. Treat it as the source of truth for scope
and sequencing; don't jump ahead to a later phase without checking it first.

**Phase 1.5 gates Phase 3.** Do not build the SendBlue/iMessage integration until
the satellite-SMS field test (Phase 1.5 in the plan) has actually been run — it may
make Phase 3 unnecessary entirely.

## Architecture

An **Nx monorepo** (`nx@22.3.3`) with three projects:
- **`apps/api`** — an Express server that runs as a Docker container on Bradley's homelab.
- **`apps/web`** — the composer PWA (Vite + React + `vite-plugin-pwa`), see below.
- **`libs/sms-format`** — the `lat,lon | question` format both of them use:
  `parseMessage`, `formatMessage`, `isPlainAscii`, `toAscii`. Change the message
  format here, never in one app only.

`apps/api` was a Firebase Function until 2026-10-29; there is no GCP/Firebase
project any more.

Inside `apps/api/src/`:
- `main.ts` — entry point: `loadConfig()`, Express app with `POST /sms` and
  `GET /healthz`, SIGTERM shutdown.
- `handler.ts` — `createSmsHandler(config)`: verify → allowlist → parse → weather →
  claude → send. Providers are built once at startup, not per request.
- `messaging/types.ts` + `messaging/twilio.ts` — `MessagingProvider` interface and its
  Twilio implementation. Replies go out via the Twilio **REST API** (`send()`), not
  inline TwiML — this is what would let a conditional future SendBlue swap (Phase 3)
  be a new sibling file instead of a rewrite of the handler.
- `weather.ts` — Open-Meteo provider; `parseOpenMeteoResponse` is pure and
  fixture-tested, `createOpenMeteoProvider` is the impure fetch wrapper.
- `claude.ts` — prompt construction + the Anthropic API call (`claude-haiku-4-5`).
- `auth.ts`, `sms.ts` — pure helpers (allowlist, SMS character budget/truncation,
  usage and HELP texts). Parsing comes from `@bivy-app/sms-format`.
- `config.ts` — reads env vars (see `apps/api/.env.example`); throws on a missing one.
- `log.ts` — one JSON object per line on stdout/stderr, for Loki.

The handler always answers the webhook with an empty TwiML 200 (the reply goes out
via REST). Non-allowlisted senders get no reply at all; handler failures send
`FORECAST_UNAVAILABLE` from `sms.ts`.

**`apps/site/`** is not an Nx project: plain HTML/CSS pages (home, privacy, terms)
published to GitHub Pages at `https://bradgaynor.com/bivy-app/index.html`. They exist
for Twilio toll-free verification, so they must keep the opt-in description, privacy
statement (mobile info never shared for marketing), STOP/HELP instructions and the
contact `bivy@bradgaynor.com`. **Link with explicit `.html` paths** (`index.html`,
never `./` or `/bivy-app/`): the `bradgaynor.com` root site (`Bmgaynor.github.io`)
has an old service worker that rewrites extensionless page loads to its own homepage.
`HELP_REPLY` in `sms.ts` points at the same URL and email.

**`apps/web`** is the composer from Phase 2 (composer only, no trip records yet),
served at `https://bradgaynor.com/bivy-app/app/index.html` (Vite `base` is
`/bivy-app/app/`). One screen: GPS or typed coordinates, question templates, a
preview with a 160-character count, then `sms:` "Open in Messages" or Copy. Bivy's
number, saved templates and the last location live only in the phone's
localStorage. The service worker precaches everything so it opens offline. Pure
logic is in `src/compose.ts`. Icons in `public/` are generated from `icon.svg`
(`npx pwa-assets-generator --config apps/web/pwa-assets.config.ts`). Tests run in
jsdom with `src/test-setup.ts`, which works around Node 25+'s own `localStorage`
global shadowing jsdom's.

Both apps resolve `@bivy-app/sms-format` through `tsconfig.base.json` paths, plus a
matching `resolve.alias` in each Vitest/Vite config (Vitest doesn't read tsconfig
paths). Generators add `@nx/vitest`/`@nx/vite` inferred-target plugins and Prettier
files; this repo uses explicit `nx:run-commands` targets and Biome instead.

Phase 4's shared trip schema (`libs/*`) doesn't exist yet; see the
`nx-generate-project` skill when that work starts.

## Commands

```bash
nx serve api            # tsx watch, env from apps/api/.env.local (copy .env.example)
nx serve web            # composer at http://localhost:4200/bivy-app/app/
nx test web / nx test sms-format
nx test api             # vitest
nx lint api             # biome check apps/api
nx build api            # esbuild: one self-contained ESM bundle, dist/apps/api/main.js
nx run api:check-prompts  # prompt-quality tool against live Anthropic API (see prompt-check skill)
npx nx affected -t lint,test,build   # only re-verify what changed (see nx-affected-check skill)
npx tsc -p apps/api/tsconfig.app.json --noEmit   # type-check (esbuild doesn't)
```

Single test file / test name (vitest runs from `apps/api`, so paths are relative to it):

```bash
cd apps/api && npx vitest run src/parse.spec.ts
cd apps/api && npx vitest run -t "<test name substring>"
```

Lint/format is **Biome** (`npx biome check --write apps/api` to autofix). Tests are
**Vitest**. The `eslint`/`jest`/`prettier` devDependencies are leftover Nx generator
scaffolding and aren't wired to any target.

The build bundles every npm dependency into `main.js` (`thirdParty: true`), with a
`createRequire` banner so CommonJS deps (express, twilio) work in ESM output. Nx's
project graph doesn't list `api`'s npm deps, so `generatePackageJson` can't be relied
on to produce an installable `package.json`. Keep the bundle self-contained.

## Deployment

1. `.github/workflows/ci.yml`: every PR/push runs `nx affected -t lint,test,build`;
   pushes to `main` then build `apps/api/Dockerfile` and push
   `ghcr.io/bmgaynor/bivy:latest` (+ `:sha-<sha>`). The package is public.
2. The **`bmgaynor/homelab`** repo (Pulumi, Docker) runs the container as `bivy`.
   Renovate there pins the image digest and opens a PR when `latest` moves; merging
   it deploys via the homelab's self-hosted runner. Merging to `main` here does not
   deploy by itself.
3. Secrets are GitHub Actions secrets **in the homelab repo** (`BIVY_*`), mapped to
   container env vars by its Pulumi stack. Not in this repo, never in Secret Manager.
4. The container publishes `127.0.0.1:8787` only. Tailscale Funnel on the host exposes
   it publicly at `https://homelab.<tailnet>.ts.net`; the Twilio webhook is that
   URL + `/sms`.
5. `.github/workflows/pages.yml`: pushes to `main` that touch `apps/site/**`,
   `apps/web/**` or `libs/**` build the composer and publish one Pages site:
   `apps/site/*` at `/bivy-app/` and the `apps/web` build at `/bivy-app/app/`. It's a project site under the
   `Bmgaynor.github.io` user site, so the path is the repo name and there's no CNAME.

This repo is **public** (needed for Pages on the free plan). Secrets never belong
here; they live in the homelab repo, which stays private.

The homelab repo has its own CLAUDE.md with hard rules (Pulumi only runs on the
server, changes go through PRs). Follow it when touching the deployment side.

## Twilio signature verification

`verify()` validates against the configured `WEBHOOK_URL`, not a URL rebuilt from the
request, because Funnel and ngrok rewrite what the server sees. `WEBHOOK_URL` must
match the Twilio console's webhook exactly (scheme, host, `/sms` path); a 403 almost
always means they differ.

## Skills

- `twilio-dev-loop` — local Twilio webhook testing loop (`nx serve api` + ngrok +
  round-trip SMS test). Use while iterating on the message-handling path.
- `prompt-check` — validates the Claude system prompt's output against fixtures:
  ASCII-only, no markdown, ≤300 chars, grounded in the supplied weather data. Use
  while iterating on the system prompt.
- `nx-affected-check` — run before committing: `nx affected -t lint,test,build`.
- `nx-generate-project` — generator commands for new apps and `libs/*` (Phase 4).

## Status

Phase 1 (POC) is built and was moved from Firebase Functions to the homelab on
2026-10-29. Next milestone per the plan: the Phase 1.5 satellite field test.
