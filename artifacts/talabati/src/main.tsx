import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setDeviceIdGetter, setTokenRefresher } from "@workspace/api-client-react";
import { getDeviceId } from "@/lib/device-id";
import { tokenRefresher } from "@/lib/token-refresh";

// Always point to the Render backend. VITE_API_BASE_URL overrides this at
// build time (e.g. for staging), but falls back to the production Render URL
// so Netlify/Vercel deploys work even when the env var is absent from the
// build environment.
const PRODUCTION_API_URL = "https://mizu-nyv1.onrender.com";
const apiBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  PRODUCTION_API_URL;
setBaseUrl(apiBase);

setDeviceIdGetter(getDeviceId);

// On every 401 response, customFetch will call tokenRefresher() to exchange
// the expired access token for a fresh one (via POST /api/auth/refresh) and
// then automatically retry the failed request with the new token.
setTokenRefresher(tokenRefresher);

createRoot(document.getElementById("root")!).render(<App />);
