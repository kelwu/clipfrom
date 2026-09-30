import { useNavigate } from "react-router-dom";
import FeaturesSection from "@/components/landing/FeaturesSection";
import BackgroundIcons from "@/components/landing/BackgroundIcons";

export default function Features() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      <BackgroundIcons />

      {/* Nav */}
      <header className="relative z-10 px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-white tracking-tight">
            Clip<span className="text-emerald-400">From</span>
          </span>
        </button>

        <button
          onClick={() => navigate("/")}
          className="bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 text-cf-deep"
        >
          Create Your First Clip
        </button>
      </header>

      {/* Page title */}
      <div className="relative z-10 text-center pt-10 pb-2 px-4">
        <span className="inline-block text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">
          Product
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white">
          Features
        </h1>
      </div>

      {/* Features section */}
      <div className="relative z-10">
        <FeaturesSection />
      </div>
    </div>
  );
}
