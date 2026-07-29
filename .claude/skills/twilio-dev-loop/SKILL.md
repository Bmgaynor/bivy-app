---
name: twilio-dev-loop
description: Use when testing the SMS webhook handler locally against Twilio — starts the Nx-served function + emulator, tunnels it with ngrok, points the Twilio number's webhook at the tunnel, and walks through sending/confirming a real SMS round trip. Use whenever iterating on apps/api/src/main.ts, apps/api/src/auth.ts, or anything in apps/api/src/messaging/, during Phase 1 development.
---

# Twilio local dev loop

Corresponds to steps 5–6 of the Phase 1 checklist in `satellite-weather-assistant-plan.md`.

## Steps

1. Start the local handler + emulator: `nx serve bivy` (builds `apps/api` in esbuild
   watch mode and launches the Firebase Emulator Suite for the `bivy` app; use
   `nx run bivy:emulate` directly if you only need the Functions emulator, not the
   full watch+emulate combo).
2. In a separate terminal, tunnel the Functions emulator port: `ngrok http 5001`.
   Copy the `https://*.ngrok-free.app` URL.
3. Point the Twilio number's webhook at
   `<ngrok-url>/<firebase-project-id>/us-central1/sms` — the real emulator URL
   shape is `<host>/<project-id>/<region>/<function-name>`. **The function name is
   `sms`**, not `api` — `api` is the Firebase *codebase* name (`firebase.json`'s
   `functions[0].codebase`, used for `--only functions:api` deploy filtering), but
   the actual HTTPS endpoint is named after the exported symbol in `main.ts`
   (`export const sms = onRequest(...)`). (Twilio Console → Phone Numbers → your
   number → "A message comes in"), or via `twilio-cli`:
   ```
   twilio phone-numbers:update <phone-sid> --sms-url=<ngrok-url>/<project-id>/us-central1/sms
   ```
4. Text the Twilio number from your **verified personal number** (trial accounts only deliver to verified numbers).
5. Confirm:
   - Request arrived at the local handler (check logs)
   - `X-Twilio-Signature` validated correctly
   - Allowlist check passed for your number
   - Weather fetch + Claude call completed within the webhook timeout
   - Reply arrived back on the phone, under the character budget
6. Negative test: text from a non-allowlisted number (or temporarily remove yours from `ALLOWED_NUMBERS`) and confirm silence/decline, not an error or crash.

## Gotchas

- Twilio trial accounts prepend a banner to every outbound message — it eats into the ~300-char budget. Don't be surprised if a reply that looked fine locally gets truncated in the actual SMS.
- ngrok URLs change on restart unless you're on a paid plan with a reserved domain — re-run step 3 each session.
- If the webhook doesn't fire at all, check the Twilio number's messaging service isn't overriding the webhook configured on the number itself.
- `ALLOWED_NUMBERS`/`ANTHROPIC_API_KEY`/etc. resolve locally from
  `apps/bivy/environment/.secret.local` (git-ignored) when running under the
  emulator — separate from the real Secret Manager values used in production,
  and must be filled in once per machine.
