import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setDeviceIdGetter } from "@workspace/api-client-react";
import { getDeviceId } from "@/lib/device-id";

const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase);
}

setDeviceIdGetter(getDeviceId);

createRoot(document.getElementById("root")!).render(<App />);
