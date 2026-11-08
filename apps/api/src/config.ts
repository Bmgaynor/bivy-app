export interface Config {
  port: number;
  /**
   * The exact public URL configured as the Twilio number's webhook. Twilio
   * signs requests against this URL, and whatever proxy sits in front of the
   * server (Tailscale Funnel in production, ngrok locally) may rewrite the
   * host or path, so it's configured rather than reconstructed from the
   * request.
   */
  webhookUrl: string;
  anthropicApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  allowedNumbers: string;
  weatherProviderName: string;
}

// Everything comes from env vars: the homelab's Pulumi stack sets them on the
// container from GitHub Actions secrets, and local dev loads apps/api/.env.local.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string): string => {
    const value = env[name];
    if (!value)
      throw new Error(`Missing required environment variable ${name}`);
    return value;
  };

  return {
    port: Number(env.PORT ?? 8787),
    webhookUrl: required("WEBHOOK_URL"),
    anthropicApiKey: required("ANTHROPIC_API_KEY"),
    twilioAccountSid: required("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: required("TWILIO_AUTH_TOKEN"),
    twilioFromNumber: required("TWILIO_FROM_NUMBER"),
    allowedNumbers: required("ALLOWED_NUMBERS"),
    weatherProviderName: env.WEATHER_PROVIDER ?? "open-meteo",
  };
}
