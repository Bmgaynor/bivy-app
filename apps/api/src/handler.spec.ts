import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerify = vi.fn();
const mockParseInbound = vi.fn();
const mockSend = vi.fn();
const mockCreateTwilioProvider = vi.fn(() => ({
  verify: mockVerify,
  parseInbound: mockParseInbound,
  send: mockSend,
}));

const mockGetForecast = vi.fn();
const mockGetWeatherProvider = vi.fn(() => ({ getForecast: mockGetForecast }));

const mockAskWeatherQuestion = vi.fn();

vi.mock("./log", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("./messaging/twilio", () => ({
  createTwilioProvider: mockCreateTwilioProvider,
}));

vi.mock("./weather", () => ({
  getWeatherProvider: mockGetWeatherProvider,
}));

vi.mock("./claude", () => ({
  askWeatherQuestion: mockAskWeatherQuestion,
}));

const { createSmsHandler } = await import("./handler");

const sms = createSmsHandler({
  port: 8787,
  webhookUrl: "https://homelab.example.ts.net/sms",
  anthropicApiKey: "test-anthropic-key",
  twilioAccountSid: "test-account-sid",
  twilioAuthToken: "test-auth-token",
  twilioFromNumber: "+18005551234",
  allowedNumbers: "+14155551234",
  weatherProviderName: "open-meteo",
});

function fakeReq(body: Record<string, string> = {}) {
  return { body } as unknown as import("express").Request;
}

function fakeRes() {
  const res: {
    set: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  } = {
    set: vi.fn(),
    status: vi.fn(),
    send: vi.fn(),
  };
  res.set.mockReturnValue(res);
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res as unknown as import("express").Response;
}

describe("createSmsHandler", () => {
  it("builds the providers once from config", () => {
    expect(mockCreateTwilioProvider).toHaveBeenCalledWith({
      accountSid: "test-account-sid",
      authToken: "test-auth-token",
      fromNumber: "+18005551234",
      webhookUrl: "https://homelab.example.ts.net/sms",
    });
    expect(mockGetWeatherProvider).toHaveBeenCalledWith("open-meteo");
  });
});

describe("sms handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockReturnValue(true);
    mockSend.mockResolvedValue(undefined);
    mockParseInbound.mockReturnValue({
      from: "+14155551234",
      body: "47.5,-121.8 | wind?",
    });
    mockGetForecast.mockResolvedValue({
      fetchedAt: "2026-07-28T12:00:00.000Z",
      location: { lat: 47.5, lon: -121.8 },
      periods: [],
    });
    mockAskWeatherQuestion.mockResolvedValue("Clear this afternoon.");
  });

  it("returns 403 and sends nothing when signature verification fails", async () => {
    mockVerify.mockReturnValue(false);
    const res = fakeRes();

    await sms(fakeReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("silently acks when the sender isn't allowlisted", async () => {
    mockParseInbound.mockReturnValue({ from: "+19995551111", body: "hi" });
    const res = fakeRes();

    await sms(fakeReq(), res);

    expect(mockSend).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sends the usage hint when the message doesn't parse", async () => {
    mockParseInbound.mockReturnValue({ from: "+14155551234", body: "hello" });
    const res = fakeRes();

    await sms(fakeReq(), res);

    expect(mockSend).toHaveBeenCalledWith(
      "+14155551234",
      expect.stringContaining("Text:"),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sends contact info for HELP without fetching weather", async () => {
    mockParseInbound.mockReturnValue({ from: "+14155551234", body: " help " });
    const res = fakeRes();

    await sms(fakeReq(), res);

    expect(mockSend).toHaveBeenCalledWith(
      "+14155551234",
      expect.stringContaining("bivy@bradgaynor.com"),
    );
    expect(mockGetForecast).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("fetches weather, asks Claude, and sends the reply on the happy path", async () => {
    const res = fakeRes();

    await sms(fakeReq(), res);

    expect(mockGetForecast).toHaveBeenCalledWith(47.5, -121.8);
    expect(mockAskWeatherQuestion).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith(
      "+14155551234",
      "Clear this afternoon.",
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sends a fallback message and still acks when weather/claude throws", async () => {
    mockGetForecast.mockRejectedValue(new Error("timeout"));
    const res = fakeRes();

    await sms(fakeReq(), res);

    expect(mockSend).toHaveBeenCalledWith(
      "+14155551234",
      expect.stringContaining("Couldn't reach the forecast"),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
