import { Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a0a12", color: "#e5e5f0", fontFamily: "system-ui", gap: 16, padding: 24 }}>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</p>
          <p style={{ fontSize: 14, color: "#888", margin: 0 }}>Please reload the page.</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", borderRadius: 8, background: "#7c3aed", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import ProtectedRoute from "./components/ProtectedRoute";
import ArticleInput from "./pages/ArticleInput";
import CaptionEditor from "./pages/CaptionEditor";
import VideoResults from "./pages/VideoResults";
import Studio from "./pages/Studio";
import Features from "./pages/Features";
import Login from "./pages/Login";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Dashboard from "./pages/Dashboard";
import VideoStyle from "./pages/VideoStyle";
import Settings from "./pages/Settings";
import UpgradeSuccess from "./pages/UpgradeSuccess";
import UpdatePassword from "./pages/UpdatePassword";
import InstagramCallback from "./pages/InstagramCallback";
import ClipReview from "./pages/ClipReview";
import HighlightPicker from "./pages/HighlightPicker";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<ArticleInput />} />
            <Route path="/features" element={<Features />} />
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/auth/instagram/callback" element={<InstagramCallback />} />
            <Route path="/editor" element={<ProtectedRoute><CaptionEditor /></ProtectedRoute>} />
            <Route path="/video-style/:projectId" element={<ProtectedRoute><VideoStyle /></ProtectedRoute>} />
            <Route path="/results/:projectId" element={<ProtectedRoute><VideoResults /></ProtectedRoute>} />
            <Route path="/review/:projectId" element={<ProtectedRoute><ClipReview /></ProtectedRoute>} />
            <Route path="/highlight-picker/:projectId" element={<ProtectedRoute><HighlightPicker /></ProtectedRoute>} />
            <Route path="/studio/:projectId" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/upgrade/success" element={<ProtectedRoute><UpgradeSuccess /></ProtectedRoute>} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
