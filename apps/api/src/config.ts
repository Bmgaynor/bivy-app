import { defineSecret, defineString } from "firebase-functions/params";

// All five hold sensitive values (auth tokens, an API key, and phone numbers,
// which are treated as PII) so they're Secret Manager secrets, not plain env
// vars. Set once per environment via `firebase functions:secrets:set <NAME>`;
// GitHub Actions never touches these values (see .github/workflows/deploy.yml).
export const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
export const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
export const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
export const twilioFromNumber = defineSecret("TWILIO_FROM_NUMBER");
export const allowedNumbers = defineSecret("ALLOWED_NUMBERS");

// Not sensitive — a plain params.defineString with a code-level default so
// non-interactive deploys never block waiting for it.
export const weatherProviderName = defineString("WEATHER_PROVIDER", {
  default: "open-meteo",
});
