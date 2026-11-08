import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const env = {
  WEBHOOK_URL: "https://homelab.example.ts.net/sms",
  ANTHROPIC_API_KEY: "key",
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_FROM_NUMBER: "+18005551234",
  ALLOWED_NUMBERS: "+14155551234",
};

describe("loadConfig", () => {
  it("defaults the port and weather provider", () => {
    const config = loadConfig(env);
    expect(config.port).toBe(8787);
    expect(config.weatherProviderName).toBe("open-meteo");
    expect(config.webhookUrl).toBe(env.WEBHOOK_URL);
  });

  it("reads PORT and WEATHER_PROVIDER when set", () => {
    const config = loadConfig({ ...env, PORT: "9000", WEATHER_PROVIDER: "x" });
    expect(config.port).toBe(9000);
    expect(config.weatherProviderName).toBe("x");
  });

  it("throws naming the first missing required variable", () => {
    const { TWILIO_AUTH_TOKEN: _, ...missing } = env;
    expect(() => loadConfig(missing)).toThrow("TWILIO_AUTH_TOKEN");
  });
});
