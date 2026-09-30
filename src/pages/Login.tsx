import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Only same-site paths — never an absolute URL from the query string
  const rawReturnTo = searchParams.get("returnTo") || "/";
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/";

  // "Get Started" links open straight to sign-up (?mode=signup)
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "update-password">(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Detect when Supabase redirects back after a password reset email click
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update-password");
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${returnTo}` },
    });
    if (error) { toast.error(error.message); setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "update-password") {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { toast.error(error.message); } else {
        toast.success("Password updated — signing you in…");
        navigate(returnTo, { replace: true });
      }
    } else if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://clipfrom.ai/update-password",
      });
      if (error) { toast.error(error.message); } else { setResetSent(true); }
    } else if (mode === "signup") {
      // The confirmation link signs them in and brings them back to where they started
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}${returnTo}` },
      });
      if (error) { toast.error(error.message); } else { setSignedUp(true); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { toast.error(error.message); } else { navigate(returnTo, { replace: true }); }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-cf-deep flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <span className="text-lg font-bold text-white tracking-tight">ClipFrom</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {mode === "update-password" ? (
            <>
              <h1 className="text-xl font-bold text-white mb-1">Set new password</h1>
              <p className="text-sm text-gray-500 mb-6">Choose a new password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">New password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-60 rounded-lg text-sm font-semibold text-white transition-colors"
                >
                  {loading ? "Updating…" : "Update password"}
                </button>
              </form>
            </>
          ) : resetSent ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Check your email</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                We sent a reset link to <span className="text-gray-200">{email}</span>. Click it to set a new password.
              </p>
              <button
                onClick={() => { setMode("signin"); setResetSent(false); }}
                className="mt-6 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Back to sign in
              </button>
            </div>
          ) : signedUp ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Check your email</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                We sent a confirmation link to <span className="text-gray-200">{email}</span>. Click it and you'll be signed in and brought right back — anything you typed is saved.
              </p>
              <button
                onClick={() => { setMode("signin"); setSignedUp(false); }}
                className="mt-6 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white mb-1">
                {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
              </h1>
              <p className="text-sm text-gray-500 mb-6">
                {mode === "signin" ? "Sign in to access your videos." : mode === "signup" ? "Your first 2 videos are free — no credit card." : "Enter your email and we'll send a reset link."}
              </p>

              {mode !== "reset" && (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-2.5 bg-white hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-gray-800 transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-800" />
                    <span className="text-xs text-gray-600">or</span>
                    <div className="flex-1 h-px bg-gray-800" />
                  </div>
                </>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                {mode !== "reset" && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-400">Password</label>
                      {mode === "signin" && (
                        <button type="button" onClick={() => setMode("reset")} className="text-xs text-gray-500 hover:text-violet-400 transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 text-cf-deep"
                >
                  {loading && (
                    <svg className="animate-spin" width={14} height={14} fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                </button>
              </form>

              <p className="text-center text-sm text-gray-600 mt-5">
                {mode === "reset" ? (
                  <button onClick={() => setMode("signin")} className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                    Back to sign in
                  </button>
                ) : (
                  <>
                    {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
                    <button
                      onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                      className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
                    >
                      {mode === "signin" ? "Sign up" : "Sign in"}
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          <Link to="/" className="hover:text-gray-500 transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
