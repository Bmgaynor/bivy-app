import type { Request } from "express";
import twilio from "twilio";
import type { MessagingProvider } from "./types";

export interface TwilioProviderConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  /** The exact URL configured as the Twilio number's webhook. */
  webhookUrl: string;
}

/**
 * Twilio adapter. Sends replies via the REST API (not inline TwiML) so
 * `MessagingProvider.send()` is a real out-of-band operation — this is what
 * lets a conditional future SendBlue swap (Phase 3) be a new sibling file
 * instead of a rewrite of main.ts's response path.
 */
export function createTwilioProvider(
  cfg: TwilioProviderConfig,
): MessagingProvider {
  const client = twilio(cfg.accountSid, cfg.authToken);

  return {
    parseInbound(req: Request) {
      const body = (req.body ?? {}) as Record<string, string>;
      return { from: body.From ?? "", body: body.Body ?? "" };
    },

    verify(req: Request) {
      const signature = req.header("X-Twilio-Signature");
      if (!signature) return false;

      // Validate against the configured webhook URL, never one rebuilt from
      // the request: Tailscale Funnel and ngrok both sit in front of the
      // server, so req.protocol / host / originalUrl reflect the hop to the
      // container, not the URL Twilio actually signed.
      return twilio.validateRequest(
        cfg.authToken,
        signature,
        cfg.webhookUrl,
        req.body ?? {},
      );
    },

    async send(to: string, body: string) {
      await client.messages.create({ to, from: cfg.fromNumber, body });
    },
  };
}
