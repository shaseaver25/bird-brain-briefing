import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radio } from "lucide-react";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setMode("reset");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account.");
    } else if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) setError(error.message);
      else setMessage("Check your email for a password reset link.");
    } else if (mode === "reset") {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else {
        setMessage("Password updated. You're signed in.");
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    setLoading(false);
  };

  const title =
    mode === "signup" ? "Sign Up" :
    mode === "forgot" ? "Send Reset Link" :
    mode === "reset" ? "Set New Password" : "Sign In";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Radio className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-mono font-bold text-foreground">Staff Meeting</h1>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">TailoredU LLC</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== "reset" && (
            <div>
              <label className="block text-sm font-mono text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          {mode !== "forgot" && (
            <div>
              <label className="block text-sm font-mono text-muted-foreground mb-1">
                {mode === "reset" ? "New Password" : "Password"}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-primary">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-mono font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "..." : title}
          </button>
        </form>

        {mode !== "reset" && (
          <div className="text-center text-sm text-muted-foreground space-y-2">
            {mode === "signin" && (
              <button
                onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}
                className="text-primary hover:underline font-medium block w-full"
              >
                Forgot password?
              </button>
            )}
            <p>
              {mode === "signup" ? "Already have an account?" :
               mode === "forgot" ? "Remember your password?" :
               "Don't have an account?"}{" "}
              <button
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
                  setError(""); setMessage("");
                }}
                className="text-primary hover:underline font-medium"
              >
                {mode === "signup" || mode === "forgot" ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
