import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import DriverDashboard from "@/pages/driver-dashboard";
import DriverUploadDocs from "@/pages/driver-upload-docs";
import SubscriptionPage from "@/pages/subscription";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { useTokenRefresh } from "@/hooks/use-token-refresh";

// ─────────────────────────────────────────────────────────────────────────────
// Global session-eviction listener
// When the API returns SESSION_EVICTED, force-logout and redirect to login.
// ─────────────────────────────────────────────────────────────────────────────
function SessionEvictionGuard() {
  const logout = useAuth((s) => s.logout);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handler = (e: CustomEvent<{ code?: string }>) => {
      if (e.detail?.code === "SESSION_EVICTED") {
        logout();
        setLocation("/");
      }
    };
    window.addEventListener("api-error", handler as EventListener);
    return () => window.removeEventListener("api-error", handler as EventListener);
  }, [logout, setLocation]);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Push subscription — registers SW and subscribes drivers after login.
// Fails silently on unsupported browsers or denied permission.
// ─────────────────────────────────────────────────────────────────────────────
function PushSubscriptionGate() {
  const userId   = useAuth((s) => s.userId);
  const userType = useAuth((s) => s.userType);
  // Only subscribe drivers — they are the ones receiving order push alerts
  usePushSubscription(userType === "سائق" ? userId : null);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token refresh gate — proactively refreshes the Supabase JWT before it
// expires and auto-retries on 401 via customFetch.
// ─────────────────────────────────────────────────────────────────────────────
function TokenRefreshGate() {
  useTokenRefresh();
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.data?.code === "SESSION_EVICTED") return false;
        return failureCount < 2;
      },
    },
    mutations: {
      onError: (error: any) => {
        if (error?.data?.code === "SESSION_EVICTED") {
          window.dispatchEvent(new CustomEvent("api-error", { detail: { code: "SESSION_EVICTED" } }));
        }
      },
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/driver-dashboard" component={DriverDashboard} />
      <Route path="/driver-upload-docs" component={DriverUploadDocs} />
      <Route path="/subscription" component={SubscriptionPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <SessionEvictionGuard />
              <TokenRefreshGate />
              <PushSubscriptionGate />
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
