# Building features in Bivy

How to add to Bivy without breaking the parts that aren't obvious from any one
file. Read [`CLAUDE.md`](../CLAUDE.md) first for what exists; this doc is about
changing it. Scope and sequencing live in
[`satellite-weather-assistant-plan.md`](../satellite-weather-assistant-plan.md).

## How a text flows

A phone texts the Twilio number. Twilio POSTs the webhook to Tailscale Funnel on
the homelab, which proxies to the `apps/api` container on `127.0.0.1:8787`.
`createSmsHandler` in `apps/api/src/handler.ts` then runs, in order: verify the
Twilio signature → check the allowlist → `parseMessage` → weather provider →
`askWeatherQuestion` (Claude) → `provider.send` (Twilio REST API). The webhook
itself always gets an empty TwiML 200.

Separately, GitHub Pages serves the info pages (`apps/site`) at
`bradgaynor.com/bivy-app/` and the composer (`apps/web`) at
`bradgaynor.com/bivy-app/app/`.

## Where does my change go?

| Kind of change | Where | Start from |
|---|---|---|
| Message format (`lat,lon \| question`) | `libs/sms-format` | `parseMessage`, `formatMessage`, `toAscii` |
| What the server replies, keywords like HELP | `apps/api/src/handler.ts`, `apps/api/src/sms.ts` | `isHelpRequest` / `HELP_REPLY` |
| How Claude answers | `apps/api/src/claude.ts` | `buildSystemPrompt`, `buildUserMessage`; check with the `prompt-check` skill |
| Weather data or a new source | `apps/api/src/weather.ts` | `WeatherProvider`, `getWeatherProvider`, `parseOpenMeteoResponse` |
| A different SMS/iMessage provider | `apps/api/src/messaging/` | `MessagingProvider` (Phase 3 is gated, see below) |
| A setting or secret | `apps/api/src/config.ts` + the homelab repo | `loadConfig` |
| The composer app | `apps/web/src/app/app.tsx` | pure logic in `apps/web/src/compose.ts` |
| Info, privacy and terms pages | `apps/site` | plain HTML, no build |
| Who can use it | `ALLOWED_NUMBERS` setting | `parseAllowlist`, `isAllowed` in `auth.ts` |

## Rules that bite

- **Check the phase first.** The plan doc orders the work. Phase 1.5 (the
  satellite field test) gates Phase 3 (SendBlue/iMessage): don't build Phase 3
  until that test has run.
- **Replies are plain ASCII.** One non-ASCII character (a curly quote, an
  emoji) drops an SMS from 160 to 70 characters per segment. Test new reply
  text with `isPlainAscii`.
- **Replies are short.** `truncateToBudget` caps Claude's answer at
  `SMS_CHAR_BUDGET` (300, two texts). Fixed texts like `HELP_REPLY` should fit
  one 160-character text. While on the Twilio trial, every message also gets a
  38-character "Sent from your Twilio trial account - " prefix.
- **The parser is strict and shared.** Only `lat,lon | question` parses.
  Change the format only in `libs/sms-format`, keep old texts parsing (people
  have them saved), and update both apps in the same PR.
- **Replies go out through the API, not the webhook response.** Use
  `provider.send` and end with the empty TwiML ack, like the existing branches.
  Non-allowlisted numbers get no reply at all, on purpose.
- **`WEBHOOK_URL` must match the Twilio console exactly.** Signatures are
  checked against it; a mismatch is a 403 on every request.
- **`apps/site` URLs are fixed.** Twilio's toll-free verification and
  `HELP_REPLY` point at `index.html`, `privacy.html` and `terms.html`. Don't
  rename them, keep the opt-in, privacy, STOP/HELP and contact content, and
  write links with explicit `.html` paths (see `CLAUDE.md` for why).
- **This repo is public.** No secrets, no real phone numbers. Tests use `555`
  numbers; secrets live in the private homelab repo.
- **Tooling is Biome + Vitest + explicit targets.** Nx generators add
  inferred-target plugins (`@nx/vite/plugin`, `@nx/vitest`) and Prettier files.
  Remove them and write `nx:run-commands` targets like the existing projects.
  Libraries are imported via `tsconfig.base.json` paths plus a matching
  `resolve.alias` in each Vite/Vitest config.

## From branch to production

1. Branch off `main`, make the change, and add tests next to the code
   (`*.spec.ts`).
2. Run the checks:
   ```bash
   npx nx affected -t lint,test,build              # what your change touched
   npx nx run-many -t typecheck -p web,sms-format  # esbuild/vite don't type-check
   npx tsc -p apps/api/tsconfig.app.json --noEmit  # api has no typecheck target
   ```
3. Open a PR. CI (`.github/workflows/ci.yml`, job `verify`) runs the same checks.
4. Merge. What happens next depends on what changed:

| Changed | Goes live | How |
|---|---|---|
| `apps/site`, `apps/web`, `libs/**` | About a minute after merge | `pages.yml` builds the composer and deploys both to Pages |
| `apps/api` (or `libs/**`) | When a homelab PR is merged | `ci.yml` publishes `ghcr.io/bmgaynor/bivy:latest`; Renovate opens a digest PR in `Bmgaynor/homelab`; merging it runs `pulumi up` on the server |
| A new setting or secret | After the homelab change deploys | See recipe 5 |

**Rolling back:** for Pages, revert the commit on `main`. For the server, revert
the digest bump in the homelab repo and let it deploy.

## Recipes

### 1. Add a composer question template
1. Add `{ label, text }` to `BUILT_IN_TEMPLATES` in `apps/web/src/compose.ts`.
   Keep `text` short and plain ASCII; it's sent over satellite.
2. Put any context (activity, elevation) in the question itself, after the
   pipe: `ski 8k: wind loading on N aspects?`.
3. `npx nx test web`, then check it in `npx nx serve web`. It's live after merge.

### 2. Add a keyword command (like HELP)
This is how `HELP` was added (PR #2):
1. In `apps/api/src/sms.ts`, add the reply text constant and a matcher, like
   `HELP_REPLY` and `isHelpRequest` (match the whole message, any case, trimmed).
2. In `handler.ts`, add a branch **after** the allowlist check and **before**
   `parseMessage`: `provider.send`, catch and log send errors, then the TwiML
   ack and `return`.
3. Tests: a `handler.spec.ts` case (reply sent, no weather fetched) and
   `sms.spec.ts` cases (matcher accepts and rejects the right input; reply is
   ASCII and at most 160 characters).
4. Don't use `STOP`, `START`, `UNSTOP` or other carrier keywords: Twilio handles
   those before they reach Bivy.
5. Mention the keyword on the site (`apps/site/index.html`) if users should
   know about it.

### 3. Change the message format
1. Change `parseMessage` and `formatMessage` in `libs/sms-format`. The existing
   form must keep parsing.
2. Extend `format.spec.ts` so every formatted message still round-trips through
   `parseMessage` and stays ASCII; add `parse.spec.ts` cases for the new form.
3. Update the composer if it should produce the new form, and `USAGE_HINT` in
   `sms.ts` if the hint should mention it.
4. Update the plan doc's compose format and the site copy that shows examples.
5. Remember that the server only gets the change after the homelab deploy, while
   the composer updates within a minute. Ship server-side parsing first if the
   composer starts producing a form the old server rejects.

### 4. Add a weather source or a fallback
`getWeatherProvider` picks one provider by the `WEATHER_PROVIDER` setting, and
there's already an `"nws"` placeholder.
1. Implement the new source in `weather.ts` as a `WeatherProvider` that returns
   the same `ForecastSummary`. Keep the parsing in a pure function (like
   `parseOpenMeteoResponse`) tested against a saved response in
   `apps/api/fixtures/`, and keep the network call thin with a timeout (Open-Meteo
   uses `OPEN_METEO_TIMEOUT_MS`, 5 seconds).
2. For a fallback, wrap two providers in one `WeatherProvider` that tries the
   second when the first throws, and return it from `getWeatherProvider`. The
   handler doesn't change.
3. The whole request (weather + Claude + send) has to finish well inside
   Twilio's webhook timeout, so keep the combined timeouts short.

### 5. Add a setting or secret
1. Add it to `Config` and `loadConfig` in `apps/api/src/config.ts` (required, or
   with a default), with a `config.spec.ts` case.
2. Add it to `apps/api/.env.example`, and to your own `apps/api/.env.local`.
3. In the private homelab repo (follow its `CLAUDE.md`; changes go through PRs):
   - a secret: read it in `infra/settings.ts` with `requireEnvSecret`, map it in
     `.github/workflows/deploy.yml`, and set it with
     `gh secret set BIVY_<NAME> --repo bmgaynor/homelab` (you type the value);
   - a plain setting: add it to `infra/Pulumi.homelab.yaml`;
   - either way, pass it to the container in `infra/bivy.ts`.
4. Set any new secret **before** merging the homelab PR: a missing one fails
   the whole homelab deploy.

### 6. Change how Claude answers
1. Edit `buildSystemPrompt` or `buildUserMessage` in `apps/api/src/claude.ts`.
2. Add a case to `apps/api/fixtures/prompt-cases.json` for the behavior you
   want.
3. Run the `prompt-check` skill (`nx run api:check-prompts`, uses your Anthropic
   key and costs a few cents). It checks ASCII, no markdown, length, and
   grounding in the supplied weather. Re-run the whole set; fixing one case can
   break another.

## Testing

- **Unit tests:** `npx nx test api` / `web` / `sms-format`. Single file:
  `cd apps/api && npx vitest run src/handler.spec.ts`.
- **Composer:** `npx nx serve web`, then open
  `http://localhost:4200/bivy-app/app/`.
- **Server against real Twilio:** the `twilio-dev-loop` skill (`nx serve api`,
  ngrok, `WEBHOOK_URL`, pointing the Twilio number at ngrok). Point it back at
  the Funnel URL afterwards.
- **Production without a phone:** send a request signed the way Twilio signs
  (HMAC-SHA1 of the URL plus the sorted form fields, keyed with the auth token)
  to `https://homelab.<tailnet>.ts.net/sms`, from an allowlisted number. Read
  the credentials from `apps/api/.env.local` inside the script; never print
  them, pass them as arguments, or commit the script. A 200 means it was
  accepted; the reply shows up in Twilio's message log.
- **Twilio's Virtual Phone** (Console → Messaging → Try it out) can text the
  number on the trial account; its number `+18777804236` must be in
  `ALLOWED_NUMBERS`.
- **Logs:** Grafana, `{container="bivy"} | json`, or
  `ssh brad@homelab docker logs -f bivy`.

## Known gaps (as of 2026-11-16)

- **Server changes don't deploy yet.** The Renovate app isn't installed on the
  homelab repo, so no digest PR ever opens. Until it is, the container stays on
  the image from 2026-10-30 (the HELP reply isn't live).
- **Replies don't reach real phones.** The Twilio account is a trial and the
  toll-free number isn't verified (error 30032). Verification needs a paid
  account; the site at `bradgaynor.com/bivy-app/index.html` is ready for it.
- **One weather source.** Open-Meteo was unreachable on 2026-11-16, and every
  question got `FORECAST_UNAVAILABLE`. Recipe 4 (an NWS fallback) fixes this.
- **SSH to the homelab now asks for a Tailscale approval** in the browser before
  it connects.
- **`apps/api` has no `typecheck` target**; run `tsc` by hand as above.
