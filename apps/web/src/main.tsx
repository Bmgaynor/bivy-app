import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/app";
import "./styles.css";

// Precaches the app so it opens with no signal; updates apply on next launch.
registerSW({ immediate: true });

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
