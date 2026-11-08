import express from "express";
import { loadConfig } from "./config";
import { createSmsHandler } from "./handler";
import { log } from "./log";

const config = loadConfig();
const app = express();

// Docker healthcheck (also reachable through Funnel, which is harmless)
app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

// Twilio posts webhooks as application/x-www-form-urlencoded
app.post(
  "/sms",
  express.urlencoded({ extended: false }),
  createSmsHandler(config),
);

const server = app.listen(config.port, () => {
  log.info("listening", { port: config.port, webhookUrl: config.webhookUrl });
});

// `docker stop` sends SIGTERM; let in-flight webhooks finish their reply
process.on("SIGTERM", () => {
  log.info("shutting down");
  server.close(() => process.exit(0));
});
