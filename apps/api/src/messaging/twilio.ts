import type { Request } from "firebase-functions/https";
import twilio from "twilio";
import type { MessagingProvider } from "./types";

export interface TwilioProviderConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
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

      // Always reconstruct as https — never trust req.protocol, which ngrok
      // and Firebase's front end can misreport as http even though the
      // webhook Twilio actually signed was https (Twilio numbers only ever
      // have HTTPS webhooks configured). Getting this wrong is the #1 cause
      // of "signature validation always fails" in this pattern.
      const url = `https://${req.get("host")}${req.originalUrl}`;
      return twilio.validateRequest(
        cfg.authToken,
        signature,
        url,
        req.body ?? {},
      );
    },

    async send(to: string, body: string) {
      await client.messages.create({ to, from: cfg.fromNumber, body });
    },
  };
}
