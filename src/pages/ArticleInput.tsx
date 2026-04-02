import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import HeroSection from "@/components/landing/HeroSection";
import InputCard from "@/components/landing/InputCard";
import FeatureHighlights from "@/components/landing/FeatureHighlights";
import HowItWorks from "@/components/landing/HowItWorks";
import SocialProof from "@/components/landing/SocialProof";
import BenefitsCarousel from "@/components/landing/BenefitsCarousel";
import SecondaryCTA from "@/components/landing/SecondaryCTA";
import Footer from "@/components/landing/Footer";
import LoadingScreen from "@/components/landing/LoadingScreen";
import BackgroundIcons from "@/components/landing/BackgroundIcons";

const ArticleInput = () => {
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [articleUrl, setArticleUrl] = useState("");
  const [articleText, setArticleText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [userEmail, setUserEmail] = useState("");
  const navigate = useNavigate();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoStages = [
    "📖 Analyzing your content...",
    "✨ Extracting key insights...",
    "🎬 Generating video descriptions...",
    "🤖 Processing with AI...",
    "🔍 Polishing and optimizing...",
    "✅ Almost ready...",
  ];

  useEffect(() => {
    if (!isLoading) return;

    setProgress(0);
    setStage(0);
    setTimeRemaining(300);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 0.4, 95));
    }, 1000);

    const stageInterval = setInterval(() => {
      setStage((prev) => (prev + 1) % videoStages.length);
    }, 30000);

    const timeInterval = setInterval(() => {
      setTimeRemaining((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stageInterval);
      clearInterval(timeInterval);
    };
  }, [isLoading]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const content = inputMode === "url" ? articleUrl.trim() : articleText.trim();

    if (!content) {
      toast.error(
        inputMode === "url"
          ? "Please enter an article URL"
          : "Please enter article text"
      );
      return;
    }

    if (inputMode === "url") {
      try {
        new URL(content);
      } catch {
        toast.error("Please enter a valid URL");
        return;
      }
    }

    if (!userEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);