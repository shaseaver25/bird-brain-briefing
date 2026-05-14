import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import Index from "./pages/Index";
import StaffMeetingPage from "./pages/StaffMeetingPage";
import KiroDashboardPage from "./pages/KiroDashboardPage";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import BookingPage from "./pages/BookingPage";
import GlobalVoiceStop from "./components/GlobalVoiceStop";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode | ((userId: string) => React.ReactNode) }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthGate>{(userId: string) => <Index userId={userId} />}</AuthGate>} />
          <Route path="/meeting" element={<AuthGate><StaffMeetingPage /></AuthGate>} />
          <Route path="/dashboard/:agentId" element={<AuthGate><KiroDashboardPage /></AuthGate>} />
          <Route path="/book" element={<BookingPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <GlobalVoiceStop />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
