import Anthropic from "@anthropic-ai/sdk";
import { onRequest } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import { isAllowed, parseAllowlist } from "./auth";
import { askWeatherQuestion } from "./claude";
import {
  allowedNumbers,
  anthropicApiKey,
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
  weatherProviderName,
} from "./config";
import { createTwilioProvider } from "./messaging/twilio";
import { parseMessage } from "./parse";
import { FORECAST_UNAVAILABLE, USAGE_HINT } from "./sms";
import { getWeatherProvider } from "./weather";

// TwiML acknowledgement sent after the real reply has already gone out via
// the messaging provider's REST API (see messaging/twilio.ts) — the webhook
// response itself never carries the answer.
const EMPTY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function sendTwimlAck(res: import("express").Response) {
  res.set("Content-Type", "text/xml").status(200).send(EMPTY_TWIML);
}

export const sms = onRequest(
  {
    secrets: [
      anthropicApiKey,
      twilioAuthToken,
      twilioAccountSid,
      twilioFromNumber,
      allowedNumbers,
    ],
    timeoutSeconds: 30,
    memory: "256MiB",
    minInstances: 0,
    region: "us-central1",
  },
  async (req, res) => {
    const startedAt = Date.now();
    const provider = createTwilioProvider({
      accountSid: twilioAccountSid.value(),
      authToken: twilioAuthToken.value(),
      fromNumber: twilioFromNumber.value(),
    });

    if (!provider.verify(req)) {
      logger.warn("rejected request with invalid Twilio signature");
      res.status(403).send();
      return;
    }

    const { from, body } = provider.parseInbound(req);
    logger.info("received sms", { from, bodyLength: body.length });

    if (!isAllowed(from, parseAllowlist(allowedNumbers.value()))) {
      // Silent per the Definition of Done — a non-allowlisted number gets no reply.
      logger.warn("rejected non-allowlisted sender", { from });
      sendTwimlAck(res);
      return;
    }

    const parsed = parseMessage(body);
    if (!parsed) {
      logger.info("unparseable message, sending usage hint", { from });
      await provider
        .send(from, USAGE_HINT)
        .catch((err) => logger.error("send failed", { from, err }));
      sendTwimlAck(res);
      return;
    }

    try {
      const weather = await getWeatherProvider(
        weatherProviderName.value(),
      ).getForecast(parsed.lat, parsed.lon);
      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const reply = await askWeatherQuestion(client, weather, parsed.question);
      await provider.send(from, reply);
      logger.info("replied", {
        from,
        durationMs: Date.now() - startedAt,
        replyLength: reply.length,
      });
    } catch (err) {
      logger.error("handler failure", { from, err });
      await provider
        .send(from, FORECAST_UNAVAILABLE)
        .catch((sendErr) =>
          logger.error("send failed", { from, err: sendErr }),
        );
    }

    sendTwimlAck(res);
  },
);
