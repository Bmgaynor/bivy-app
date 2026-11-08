# Satellite Weather Assistant — Phased Development Plan

A text-in / text-out backcountry assistant. Users SMS a dedicated number with
coordinates and a question; a stateless webhook server fetches live weather,
hands it to Claude, and texts back a useful answer. Designed to work over Apple's
satellite messaging when off-grid.

---

## Guiding Constraints

- **No hosting bill.** The backend runs as a container on the homelab (always on,
  but on hardware that's already running), replacing the original serverless /
  scale-to-zero constraint. See "On the homelab" below.
- **Free tier first.** Twilio trial, GitHub Pages, GHCR, Tailscale Funnel.
- **Stateless until it hurts.** No conversation history in Phase 1.
- **Decoupled frontend/backend.** Static PWA on GitHub Pages; function deployed separately.
- **Allowlist-gated.** Only approved numbers get responses. Never hardcoded.

---

## Phase 1 — POC: Weather Responses via SMS

**Goal:** Prove the pipe. Text coordinates + a question, get a grounded weather answer back.

### Components
- Twilio trial account + one phone number
- Single HTTP endpoint: an Express server (Node.js/TypeScript) in a container on the homelab
- Open-Meteo (no API key, generous free tier) or NOAA NWS API
- Anthropic API using existing account key

### Request flow
1. User texts the Twilio number
2. Twilio POSTs `application/x-www-form-urlencoded` webhook to the function
3. Function validates Twilio signature (`X-Twilio-Signature`) — reject unsigned requests
4. Function checks `From` against `ALLOWED_NUMBERS` env var (comma-separated E.164)
5. Parse body: extract `lat,lon` prefix and free-text question
6. Fetch forecast for those coordinates
7. Build prompt: system instructions + serialized weather JSON + user question
8. Call Claude API
9. Respond with TwiML `<Message>` (simplest) or POST back via the Twilio REST API

### Message format
```
47.5,-121.8 | what should I expect this afternoon?
```
Fallback: if no coordinates parse, reply with a short usage hint rather than erroring.

### Environment variables
| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API auth |
| `ALLOWED_NUMBERS` | Comma-separated E.164 allowlist |
| `TWILIO_AUTH_TOKEN` | Webhook signature validation |
| `TWILIO_ACCOUNT_SID` | Only if replying via REST instead of TwiML |
| `WEATHER_PROVIDER` | `open-meteo` \| `nws` |

### Hard constraints to design around
- **160 characters.** SMS segments at 160 chars (70 if any emoji/unicode sneaks in).
  Instruct Claude explicitly: plain ASCII, no markdown, hard cap ~300 chars (2 segments).
  Truncate server-side as a backstop.
- **Twilio trial accounts** only send to verified numbers and prepend a trial
  banner to every message — which eats your character budget. Budget accordingly
  or upgrade early; a number plus light usage is a few dollars a month.
- **Timeouts.** Twilio expects a webhook response quickly. Weather fetch + Claude
  call should fit comfortably, but set explicit timeouts on both and return a
  graceful "couldn't reach the forecast" message rather than hanging.
- **Cold starts.** Set min instances to 0 (free), accept a second or two of latency.

### Prompt design notes
System prompt should establish: you are a terse backcountry weather assistant;
the weather data provided is authoritative and current; never invent conditions
not present in the data; answer in under 300 plain-text characters; lead with the
actionable fact, not preamble.

### Deliverables
Built as an Nx monorepo (`apps/api` server — see CLAUDE.md's Architecture section),
not a flat `src/` layout:
- `apps/api/src/main.ts` — Express server; `handler.ts` — the `/sms` webhook handler
- `apps/api/src/weather.ts` — provider abstraction
- `apps/api/src/claude.ts` — API wrapper + prompt construction
- `apps/api/src/auth.ts` — allowlist (signature validation lives in `messaging/twilio.ts`'s `verify()`)
- `apps/api/src/messaging/types.ts` + `messaging/twilio.ts` — `MessagingProvider` interface + Twilio adapter
- `.github/workflows/deploy.yml`
- `CLAUDE.md` with local dev instructions

### Definition of done
Text the number from your phone, get a correct, readable weather answer in under
10 seconds. A non-allowlisted number gets silence (or a polite decline).

---

## Phase 1.5 — Field Validation (do not skip)

**Goal:** Confirm the satellite path actually works before building anything else.

Worth knowing: **iOS 18+ Messages via satellite supports SMS, not just iMessage.**
Satellite SMS is relayed into normal carrier delivery, which means a plain Twilio
number may work end-to-end over satellite with no SendBlue needed at all. This is
the single highest-value unknown in the whole project.

### Test
1. Drive somewhere with genuinely no cellular service (plenty of options in the Cascades)
2. Enable Messages via satellite, aim at the sky per the on-screen guide
3. Text the Twilio number
4. Record: did it arrive, how long did it take, did the reply come back

### Outcomes
- **It works** → Phase 3 is deleted. Big win. Skip straight to the SPA.
- **iMessage only** → Phase 3 proceeds as written.
- **Partial / flaky** → note failure modes; design the SPA to produce ultra-compact
  messages and consider a "did you get this?" retry convention.

---

## Phase 2 — Trip Planner SPA

**Goal:** Preload trip context on-device so field messages are short and rich.

### Stack
- Vite + TypeScript + React (lighter than Next.js; you don't need SSR for a static PWA)
- Deployed to GitHub Pages at `bradgaynor.com/bivy-app`, replacing the Phase 1
  `apps/site` compliance pages (see CLAUDE.md)
- `vite-plugin-pwa` for service worker + manifest generation

### Features
- **Trip form:** name, start/end coordinates, elevation band, dates, activity type
  (ski tour / climb / hike), planned route notes
- **Storage:** IndexedDB (via `idb`) for trip records; localStorage for app prefs
- **Offline-first:** service worker precaches the app shell; app is fully functional
  with zero connectivity
- **PWA install:** manifest with proper icons so it adds to the iOS home screen
- **Compose helper:** the core feature. Select active trip → type question →
  app generates a compact message string and opens `sms:` deep link with the body
  prefilled, or copies to clipboard as a fallback

### Compose format
Keep it dense — every character costs satellite bandwidth:
```
47.5,-121.8 8k SKI | wind loading on N aspects?
```
Trip context contributes the elevation band and activity tag; the user types only
the question.

### iOS PWA caveats to plan for
- No push notifications worth relying on
- Service worker storage can be evicted under pressure — treat IndexedDB as a
  cache, and offer a "copy trip as text" escape hatch
- `sms:` link body prefill behavior varies; test on device early and keep the
  clipboard fallback prominent

### Definition of done
Add to home screen, put the phone in airplane mode, open the app, pick a trip,
generate a message, and have it ready to send.

---

## Phase 3 — SendBlue Integration *(conditional on Phase 1.5)*

**Goal:** True iMessage delivery, if and only if satellite SMS proved insufficient.

### Work
- Swap the inbound webhook adapter: SendBlue posts JSON, not form-encoded
- Swap the outbound sender: SendBlue REST API instead of TwiML
- Everything between — allowlist, parsing, weather, Claude — stays untouched

### Design implication for Phase 1
Put the messaging provider behind an interface from day one:
```ts
interface MessagingProvider {
  parseInbound(req: Request): { from: string; body: string };
  verify(req: Request): boolean;
  send(to: string, body: string): Promise<void>;
}
```
Then Phase 3 is a new file, not a refactor.

### Evaluate before committing
- Pricing (per-message vs. monthly; no meaningful free tier historically)
- Whether iMessage delivery is reliable enough to depend on in an emergency-adjacent context
- Whether the improved character limits and read receipts justify the cost

---

## Phase 4 — Backend Trip Storage

**Goal:** Text only the question; the backend already knows where you are and what you're doing.

### Work
- Firestore collection: `trips/{userId}/{tripId}` with the same schema as the SPA
- SPA writes trips on save when online; keeps IndexedDB as the offline mirror
- Auth: phone-number-keyed. Firebase Auth phone sign-in, or simply key on the
  verified `From` number since the allowlist already gates access
- Function resolves: sender number → active trip (date range overlapping today) →
  inject route, elevation, and activity into the Claude prompt
- Coordinates in the message still override stored trip data when present

### New capability this unlocks
Short conversational follow-ups become possible — store the last N exchanges per
number with a TTL, so "what about tomorrow?" works without restating context.
Keep the window small; every token costs money and every character costs bandwidth.

### Definition of done
Text `wind loading?` with no coordinates and get an answer specific to the trip
you loaded that morning.

---

## Phase 5 — Hardening (if this becomes real)

Only relevant if it moves past personal use:

- **Rate limiting** per number — a stuck retry loop shouldn't drain the API budget
- **Cost ceiling** — billing alerts plus a hard monthly token cap in code
- **Route matching** — fuzzy-match coordinates against a trail database (AllTrails
  has no public API; consider OpenStreetMap / Overpass, or the Washington Trails
  Association data, or curate your own list of the routes you actually use)
- **Avalanche integration** — NWAC forecast API for the ski/splitboard use case;
  arguably more valuable than raw weather for winter travel
- **Disclaimer discipline** — this is decision support, not a safety device. Make
  that unambiguous in the app and in the system prompt. Never let the model imply
  a route is safe.
- **Onboarding** — self-serve number verification instead of the manual allowlist

---

## Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend | Vite + TypeScript + React, PWA via `vite-plugin-pwa` |
| Frontend hosting | GitHub Pages → `bradgaynor.com/bivy-app` (Phase 1: static `apps/site` for toll-free verification) |
| Backend | Express container on the homelab (Pulumi-managed Docker), exposed via Tailscale Funnel |
| LLM | Anthropic API (existing account) |
| Weather | Open-Meteo (primary), NOAA NWS (fallback), NWAC (Phase 5) |
| Messaging | Twilio → SendBlue (only if Phase 1.5 requires) |
| Database | None → TBD for Phase 4 (Firestore was the original pick, chosen for Firebase Functions) |
| Client storage | IndexedDB + localStorage |
| CI/CD | GitHub Actions → GHCR image → Renovate PR in the homelab repo (backend), GitHub Pages Action (frontend) |
| Monorepo | Nx, from day one — `apps/api` today; `apps/web` (Phase 2) and `libs/*` (Phase 4) slot in later |

**On NX:** built as an Nx monorepo from the start (superseding this section's
original "hold off until Phase 4" recommendation — a deliberate call to have Phase 2's
`apps/web` and Phase 4's shared `libs/trip-schema` slot into an existing workspace
rather than requiring a migration later). See CLAUDE.md's Architecture section and
the `nx-generate-project` skill for the conventions those additions should follow.

**On the homelab (replaced Firebase Functions, 2026-10-29):** the backend moved
from Firebase Functions to a container on the existing homelab server, managed by
the Pulumi stack in the `bmgaynor/homelab` repo. Twilio reaches it through
Tailscale Funnel (public HTTPS with no router port forward). Trade-off: no
scale-to-zero and no cloud SLA (if the homelab is down, texts go unanswered),
in exchange for no GCP project, no Secret Manager, and one place to run
everything.

---

## Local Setup Prerequisites

```bash
node --version    # 20+
git --version
npm i -g twilio-cli        # optional, useful for local webhook testing
brew install ngrok         # tunnel Twilio webhooks to localhost during dev
```

Accounts needed: Twilio (trial), Tailscale (existing), Anthropic (existing),
GitHub (existing).

---

## Phase 1 Entry Point — Ordered Checklist

1. **Twilio:** create trial account, buy a number, verify your personal number
2. **Repo:** scaffold `satellite-assistant-api` with TypeScript, one HTTP handler
3. **Weather module:** get Open-Meteo returning a forecast for hardcoded coordinates
   — pure function, unit-testable, no cloud needed
4. **Claude module:** get a weather JSON blob + question producing a <300 char answer
   locally. Iterate on the system prompt here; this is where the quality lives.
5. **Wire the handler:** parse Twilio form body → allowlist check → weather → Claude → TwiML
6. **Local test:** run locally, tunnel with ngrok, point the Twilio webhook at it, text it
7. **Signature validation:** add it before anything is publicly deployed
8. **Homelab:** make the GHCR image public, set the bivy secrets in the homelab
   repo, enable Tailscale Funnel (see the homelab repo's CLAUDE.md)
9. **Actions workflow:** publish the image on push to `main`; the homelab's
   Renovate PR (merged by hand) rolls it out
10. **Deploy:** point the Twilio webhook at the Funnel URL + `/sms`, text it, confirm
11. **Negative test:** text from a number not on the allowlist, confirm no response
12. **Go outside:** run the Phase 1.5 satellite test before writing another line of code

---

## Open Questions

- Does Apple's satellite SMS reach a Twilio number? *(Phase 1.5 answers this and
  potentially deletes Phase 3.)*
- What's the realistic satellite round-trip latency, and does it make follow-up
  questions impractical enough that every message should be self-contained?
- Is NWAC avalanche data more valuable than general weather for the winter use case?
  If so, it may deserve to move earlier than Phase 5.
- Where does the trail database come from, given AllTrails has no public API?
