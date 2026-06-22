import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setDeviceIdGetter, setTokenRefresher } from "@workspace/api-client-react";
import { getDeviceId } from "@/lib/device-id";
import { tokenRefresher } from "@/lib/token-refresh";

const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase);
}

setDeviceIdGetter(getDeviceId);

// On every 401 response, customFetch will call tokenRefresher() to exchange
// the expired access token for a fresh one (via POST /api/auth/refresh) and
// then automatically retry the failed request with the new token.
setTokenRefresher(tokenRefresher);

createRoot(document.getElementById("root")!).render(<App />);
