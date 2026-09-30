import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Legacy alias: older screens use `emerald-*` classes for the brand color. They map
        // to Instrument Violet (DESIGN.md), anchored on the real accent at 500.
        emerald: {
          50:  "oklch(96% 0.03 280)",
          100: "oklch(92% 0.05 280)",
          200: "oklch(86% 0.08 280)",
          300: "oklch(80% 0.12 280)",
          400: "oklch(76% 0.15 280)",
          500: "oklch(72% 0.17 280)",
          600: "oklch(66% 0.17 280)",
          700: "oklch(56% 0.17 280)",
          800: "oklch(44% 0.14 280)",
          900: "oklch(32% 0.1 280)",
          950: "oklch(22% 0.07 280)",
        },
        // DESIGN.md tokens (see src/lib/tokens.ts)
        cf: {
          deep: "oklch(10% 0.018 255)",
          sidebar: "oklch(12% 0.02 258)",
          surface: "oklch(14% 0.015 250)",
          raised: "oklch(18% 0.015 250)",
          lifted: "oklch(21% 0.015 250)",
          accent: "oklch(72% 0.17 280 / <alpha-value>)",
          ink: "oklch(96% 0.005 250)",
          muted: "oklch(82% 0.01 250)",
          dim: "oklch(70% 0.01 250)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config
