/**
 * Local dev only. The Functions emulator serves every function behind one
 * port, distinguished by a /{project}/{region}/{function} path prefix — but
 * (like the production cloudfunctions.net proxy) it strips that prefix
 * before the handler ever sees it, so req.originalUrl is always "/".
 *
 * Twilio signs against whatever webhook URL you actually configure. Point
 * ngrok at THIS proxy (not directly at the emulator), configure Twilio with
 * the bare ngrok URL (no path), and this rewrites the path before forwarding
 * to the emulator — so the signature Twilio computed against the bare ngrok
 * URL matches what the handler reconstructs (host + "/"), exactly like the
 * direct Cloud Run URL does in production.
 */
import http from "node:http";

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = Number(process.env.EMULATOR_PORT ?? 5001);
const TARGET_PATH =
  process.env.PROXY_TARGET_PATH ?? "/bivy-503901/us-central1/sms";
const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 5002);

const server = http.createServer((req, res) => {
  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      path: TARGET_PATH,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    console.error("proxy request failed", err);
    res.writeHead(502);
    res.end("Bad gateway");
  });

  req.pipe(proxyReq);
});

server.listen(LISTEN_PORT, () => {
  console.log(
    `Local webhook proxy listening on :${LISTEN_PORT}, forwarding to http://${TARGET_HOST}:${TARGET_PORT}${TARGET_PATH}`,
  );
  console.log(
    "Point ngrok at this port, and Twilio at the bare ngrok URL (no path).",
  );
});
