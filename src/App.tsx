import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import GlobalVoiceStop from "./components/GlobalVoiceStop";
import AppNav from "./components/AppNav";
import { VoiceProvider } from "./hooks/useVoiceSettings";

// Secondary routes are lazy so their (sometimes heavy) dependencies don't load
// on first paint. In particular /my-agent pulls in the ElevenLabs voice stack
// (livekit), which now loads only when someone opens that page.
const KiroDashboardPage = lazy(() => import("./pages/KiroDashboardPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MeetPage = lazy(() => import("./pages/MeetPage"));
const MyAgentPage = lazy(() => import("./pages/MyAgentPage"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground font-mono text-sm">Loading…</p>
    </div>
  );
}

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode | ((userId: string) => React.ReactNode) }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        // Network / stale-refresh-token failures must not leave the UI stuck
        // on the "Loading..." splash. Fall through to the sign-in screen.
        console.error("getSession failed:", err);
        setUser(null);
        setLoading(false);
      });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-mono text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <>{typeof children === 'function' ? children(user.id) : children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <VoiceProvider>
      <BrowserRouter>
        <AppNav />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<AuthGate>{(userId: string) => <Index userId={userId} />}</AuthGate>} />
            <Route path="/dashboard/:agentId" element={<AuthGate><KiroDashboardPage /></AuthGate>} />
            <Route path="/meet" element={<MeetPage />} />
            <Route path="/my-agent" element={<AuthGate><MyAgentPage /></AuthGate>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <GlobalVoiceStop />
      </BrowserRouter>
      </VoiceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
