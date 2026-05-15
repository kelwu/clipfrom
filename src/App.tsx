import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
            <Route path="/studio/:projectId" element={<ProtectedRoute><Studio /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/upgrade/success" element={<ProtectedRoute><UpgradeSuccess /></ProtectedRoute>} />
            <Route path="/update-password" element={<UpdatePassword />} />
{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
