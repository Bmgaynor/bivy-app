import Anthropic from "@anthropic-ai/sdk";
import type { Request, Response } from "express";
import { isAllowed, parseAllowlist } from "./auth";
import { askWeatherQuestion } from "./claude";
import type { Config } from "./config";
import { log } from "./log";
import { createTwilioProvider } from "./messaging/twilio";
import { parseMessage } from "./parse";
import {
  FORECAST_UNAVAILABLE,
  HELP_REPLY,
  isHelpRequest,
  USAGE_HINT,
} from "./sms";
import { getWeatherProvider } from "./weather";

// TwiML acknowledgement sent after the real reply has already gone out via
// the messaging provider's REST API (see messaging/twilio.ts) — the webhook
// response itself never carries the answer.
const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function sendTwimlAck(res: Response) {
  res.set("Content-Type", "text/xml").status(200).send(EMPTY_TWIML);
}

/** verify → allowlist → parse → weather → claude → send */
export function createSmsHandler(config: Config) {
  const provider = createTwilioProvider({
    accountSid: config.twilioAccountSid,
    authToken: config.twilioAuthToken,
    fromNumber: config.twilioFromNumber,
    webhookUrl: config.webhookUrl,
  });
  const allowlist = parseAllowlist(config.allowedNumbers);
  const weatherProvider = getWeatherProvider(config.weatherProviderName);
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  return async (req: Request, res: Response) => {
    const startedAt = Date.now();

    if (!provider.verify(req)) {
      log.warn("rejected request with invalid Twilio signature");
      res.status(403).send();
      return;
    }

    const { from, body } = provider.parseInbound(req);
    log.info("received sms", { from, bodyLength: body.length });

    if (!isAllowed(from, allowlist)) {
      // Silent per the Definition of Done — a non-allowlisted number gets no reply.
      log.warn("rejected non-allowlisted sender", { from });
      sendTwimlAck(res);
      return;
    }

    if (isHelpRequest(body)) {
      log.info("help request", { from });
      await provider
        .send(from, HELP_REPLY)
        .catch((err) => log.error("send failed", { from, err }));
      sendTwimlAck(res);
      return;
    }

    const parsed = parseMessage(body);
    if (!parsed) {
      log.info("unparseable message, sending usage hint", { from });
      await provider
        .send(from, USAGE_HINT)
        .catch((err) => log.error("send failed", { from, err }));
      sendTwimlAck(res);
      return;
    }

    try {
      const weather = await weatherProvider.getForecast(parsed.lat, parsed.lon);
      const reply = await askWeatherQuestion(client, weather, parsed.question);
      await provider.send(from, reply);
      log.info("replied", {
        from,
        durationMs: Date.now() - startedAt,
        replyLength: reply.length,
      });
    } catch (err) {
      log.error("handler failure", { from, err });
      await provider
        .send(from, FORECAST_UNAVAILABLE)
        .catch((sendErr) => log.error("send failed", { from, err: sendErr }));
    }

    sendTwimlAck(res);
  };
}
