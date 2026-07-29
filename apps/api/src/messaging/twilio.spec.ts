import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockValidateRequest = vi.fn();
const mockClientFactory = vi.fn(() => ({ messages: { create: mockCreate } }));

vi.mock("twilio", () => {
  const fn = Object.assign(mockClientFactory, {
    validateRequest: mockValidateRequest,
  });
  return { default: fn };
});

const { createTwilioProvider } = await import("./twilio");

function fakeRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    body: { From: "+14155551234", Body: "47.5,-121.8 | wind?" },
    protocol: "http", // deliberately wrong — verify() must not trust this
    originalUrl: "/api",
    header: vi.fn().mockReturnValue("sig-abc"),
    get: vi.fn().mockReturnValue("example.ngrok-free.app"),
    ...overrides,
  } as unknown as import("firebase-functions/https").Request;
}

const cfg = {
  accountSid: "AC123",
  authToken: "token123",
  fromNumber: "+18005551234",
};

describe("createTwilioProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockValidateRequest.mockReset();
    mockClientFactory.mockClear();
  });

  describe("parseInbound", () => {
    it("extracts from/body from the Twilio form fields", () => {
      const provider = createTwilioProvider(cfg);
      expect(provider.parseInbound(fakeRequest())).toEqual({
        from: "+14155551234",
        body: "47.5,-121.8 | wind?",
      });
    });

    it("defaults to empty strings when fields are missing", () => {
      const provider = createTwilioProvider(cfg);
      expect(provider.parseInbound(fakeRequest({ body: {} }))).toEqual({
        from: "",
        body: "",
      });
    });
  });

  describe("verify", () => {
    it("returns false when no signature header is present", () => {
      const provider = createTwilioProvider(cfg);
      const req = fakeRequest({ header: vi.fn().mockReturnValue(undefined) });
      expect(provider.verify(req)).toBe(false);
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });

    it("reconstructs the URL as https regardless of req.protocol", () => {
      mockValidateRequest.mockReturnValue(true);
      const provider = createTwilioProvider(cfg);
      const req = fakeRequest();

      const result = provider.verify(req);

      expect(result).toBe(true);
      expect(mockValidateRequest).toHaveBeenCalledWith(
        cfg.authToken,
        "sig-abc",
        "https://example.ngrok-free.app/api",
        req.body,
      );
    });

    it("propagates a false result from twilio.validateRequest", () => {
      mockValidateRequest.mockReturnValue(false);
      const provider = createTwilioProvider(cfg);
      expect(provider.verify(fakeRequest())).toBe(false);
    });
  });

  describe("send", () => {
    it("sends via the Twilio REST client with the configured from number", async () => {
      const provider = createTwilioProvider(cfg);
      await provider.send("+14155551234", "Clear this afternoon.");

      expect(mockClientFactory).toHaveBeenCalledWith(
        cfg.accountSid,
        cfg.authToken,
      );
      expect(mockCreate).toHaveBeenCalledWith({
        to: "+14155551234",
        from: cfg.fromNumber,
        body: "Clear this afternoon.",
      });
    });
  });
});
