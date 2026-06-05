import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSentry } from "./lib/sentry";
import { App } from "./App";
import "./styles/global.scss";
import "leaflet/dist/leaflet.css";

// Initialize error tracking before app renders
initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
