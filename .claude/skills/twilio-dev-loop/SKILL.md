---
name: twilio-dev-loop
description: Use when testing the SMS webhook handler locally against Twilio — runs the Express server with `nx serve api`, tunnels it with ngrok, points the Twilio number's webhook at the tunnel, and walks through sending/confirming a real SMS round trip. Use whenever iterating on apps/api/src/handler.ts, apps/api/src/auth.ts, or anything in apps/api/src/messaging/, during Phase 1 development.
---

# Twilio local dev loop

Corresponds to steps 5–6 of the Phase 1 checklist in `satellite-weather-assistant-plan.md`.

## Why `WEBHOOK_URL` matters

Twilio signs each request against the exact webhook URL configured on the
number. `messaging/twilio.ts`'s `verify()` validates against the `WEBHOOK_URL`
env var rather than rebuilding the URL from the request, because ngrok (locally)
and Tailscale Funnel (in production) both sit in front of the server and change
the host/protocol the server sees. So `WEBHOOK_URL` must match, character for
character, the URL in the Twilio console, including the `/sms` path.

**Note:** pointing the Twilio number at ngrok takes it away from the homelab
deployment. Point it back at the Funnel URL when you're done (step 7).

## Steps

1. One-time: `cp apps/api/.env.example apps/api/.env.local` and fill in the secrets
   (git-ignored).
2. Tunnel the server's port: `ngrok http 8787`. Copy the `https://*.ngrok-free.app` URL.
3. Set `WEBHOOK_URL=<ngrok-url>/sms` in `apps/api/.env.local`.
4. Start the server: `nx serve api` (`tsx watch`, restarts on source changes; env
   is only read at startup, so restart it after editing `.env.local`).
5. Point the Twilio number's webhook at the same `<ngrok-url>/sms` (Twilio Console →
   Phone Numbers → your number → "A message comes in", HTTP POST), or via `twilio-cli`:
   ```
   twilio phone-numbers:update <phone-sid> --sms-url=<ngrok-url>/sms
   ```
6. Text the Twilio number from your **verified personal number** (trial accounts
   only deliver to verified numbers) and confirm:
   - Request arrived (JSON log line `received sms`)
   - No `rejected request with invalid Twilio signature` warning
   - Allowlist check passed for your number
   - Weather fetch + Claude call completed (`replied` with `durationMs`)
   - Reply arrived back on the phone, under the character budget
7. Negative test: text from a non-allowlisted number (or temporarily remove yours
   from `ALLOWED_NUMBERS`) and confirm silence, not an error or crash.
8. Point the Twilio webhook back at the production Funnel URL
   (`https://homelab.<tailnet>.ts.net/sms`).

## Gotchas

- **A 403 means a URL mismatch, almost always.** Compare `WEBHOOK_URL` (logged on
  startup as `listening`) with the Twilio console value: same scheme, host, path,
  no trailing slash difference.
- If outbound replies don't arrive but logs show a successful send, check the
  *Twilio* number's messaging capability/verification status (e.g. a toll-free number
  needs Toll-Free Verification before it can send to US/CA mobiles — Twilio error
  30032) — that's a Twilio-side compliance gate, not a local dev issue.
- Twilio trial accounts prepend a banner to every outbound message — it eats into the ~300-char budget. Don't be surprised if a reply that looked fine locally gets truncated in the actual SMS.
- ngrok URLs change on restart unless you're on a paid plan with a reserved domain — redo steps 3–5 each session.
- If the webhook doesn't fire at all, check the Twilio number's messaging service isn't overriding the webhook configured on the number itself.
