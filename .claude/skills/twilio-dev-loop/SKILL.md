---
name: twilio-dev-loop
description: Use when testing the SMS webhook handler locally against Twilio — starts the Nx-served function + emulator, tunnels it with ngrok through a small local path-rewriting proxy, points the Twilio number's webhook at the tunnel, and walks through sending/confirming a real SMS round trip. Use whenever iterating on apps/api/src/main.ts, apps/api/src/auth.ts, or anything in apps/api/src/messaging/, during Phase 1 development.
---

# Twilio local dev loop

Corresponds to steps 5–6 of the Phase 1 checklist in `satellite-weather-assistant-plan.md`.

## Why there's a proxy in the loop

The Functions emulator serves every function behind one port, routed by a
`/{project}/{region}/{function}` path prefix — but it **strips that prefix**
before the handler ever sees the request, exactly like the production
`cloudfunctions.net/FUNCTION_NAME` proxy does (see `apps/api/src/messaging/twilio.ts`'s
`verify()` comment). That means `req.originalUrl` is always `/`, with no header
that recovers the true path. If Twilio signs against the full prefixed ngrok
URL but the handler reconstructs `host + "/"`, signature verification always
fails — this cost real debugging time in production before it was traced to
the URL shape, not the code.

The fix used in production was to point Twilio at a **bare URL with no path**
(the direct Cloud Run URL). Locally, `apps/api/scripts/local-webhook-proxy.ts`
does the equivalent: it listens on its own port, and rewrites every incoming
request's path to the full `/{project}/{region}/{function}` form before
forwarding to the emulator. Point ngrok at the proxy, and Twilio at the bare
ngrok URL — no path — so what Twilio signs matches what the handler
reconstructs.

## Steps

1. Start the local handler + emulator: `nx serve bivy` (builds `apps/api` in esbuild
   watch mode and launches the Firebase Emulator Suite for the `bivy` app; use
   `nx run bivy:emulate` directly if you only need the Functions emulator, not the
   full watch+emulate combo).
2. In a second terminal, start the local webhook proxy: `npm run webhook-proxy`
   (or `nx run api:webhook-proxy`). By default it listens on `:5002` and forwards
   to the emulator's function at `/bivy-503901/us-central1/sms` on `:5001` — override
   with the `PROXY_PORT` / `EMULATOR_PORT` / `PROXY_TARGET_PATH` env vars if either
   ever changes.
3. In a third terminal, tunnel the **proxy's** port, not the emulator's:
   `ngrok http 5002`. Copy the `https://*.ngrok-free.app` URL.
4. Point the Twilio number's webhook at the **bare** ngrok URL — no path suffix:
   (Twilio Console → Phone Numbers → your number → "A message comes in"), or via
   `twilio-cli`:
   ```
   twilio phone-numbers:update <phone-sid> --sms-url=<ngrok-url>
   ```
5. Text the Twilio number from your **verified personal number** (trial accounts only deliver to verified numbers).
6. Confirm:
   - Request arrived at the local handler (check logs)
   - `X-Twilio-Signature` validated correctly
   - Allowlist check passed for your number
   - Weather fetch + Claude call completed within the webhook timeout
   - Reply arrived back on the phone, under the character budget
7. Negative test: text from a non-allowlisted number (or temporarily remove yours from `ALLOWED_NUMBERS`) and confirm silence/decline, not an error or crash.

## Gotchas

- **The webhook URL must be bare — no path.** `<ngrok-url>/bivy-503901/us-central1/sms`
  will *not* work even though that looks like the "real" path — the proxy already
  adds that prefix internally. Configuring the path twice, or configuring it at all
  on the Twilio side, breaks signature verification. This is the single biggest
  gotcha in this whole loop.
- If outbound replies don't arrive but the emulator logs show a successful `send()`,
  check the *Twilio* number's messaging capability/verification status (e.g. a
  toll-free number needs Toll-Free Verification before it can send to US/CA mobiles —
  Twilio error 30032) — that's a Twilio-side compliance gate, not a local dev issue.
- Twilio trial accounts prepend a banner to every outbound message — it eats into the ~300-char budget. Don't be surprised if a reply that looked fine locally gets truncated in the actual SMS.
- ngrok URLs change on restart unless you're on a paid plan with a reserved domain — re-run step 4 each session.
- If the webhook doesn't fire at all, check the Twilio number's messaging service isn't overriding the webhook configured on the number itself.
- `ALLOWED_NUMBERS`/`ANTHROPIC_API_KEY`/etc. resolve locally from
  `apps/bivy/environment/.secret.local` (git-ignored) when running under the
  emulator — separate from the real Secret Manager values used in production,
  and must be filled in once per machine.
