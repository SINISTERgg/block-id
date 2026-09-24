import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "sans-serif"],
        heading: ["'Space Grotesk'", "Inter", "sans-serif"],
        body: ["'Inter'", "'Space Grotesk'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
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
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
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
        issuer: {
          DEFAULT: "hsl(var(--issuer))",
          foreground: "hsl(var(--issuer-foreground))",
          muted: "hsl(var(--issuer-muted))",
        },
        holder: {
          DEFAULT: "hsl(var(--holder))",
          foreground: "hsl(var(--holder-foreground))",
          muted: "hsl(var(--holder-muted))",
        },
        verifier: {
          DEFAULT: "hsl(var(--verifier))",
          foreground: "hsl(var(--verifier-foreground))",
          muted: "hsl(var(--verifier-muted))",
        },
        bitcoin: {
          orange: "#F7931A",
          burnt: "#EA580C",
          gold: "#FFD600",
          void: "#030304",
          matter: "#0F1115",
          stardust: "#94A3B8",
          boundary: "#1E293B",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        none: "0px",
        DEFAULT: "0.5rem",
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        full: "9999px",
      },
      boxShadow: {
        "glow-orange": "0 0 20px -5px rgba(234, 88, 12, 0.5)",
        "glow-orange-lg": "0 0 30px -5px rgba(247, 147, 26, 0.6)",
        "glow-gold": "0 0 20px rgba(255, 214, 0, 0.3)",
        "glow-card": "0 0 50px -10px rgba(247, 147, 26, 0.1)",
        "glow-input": "0 10px 20px -10px rgba(247, 147, 26, 0.3)",
      },
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.05em" }],
        sm: ["0.75rem", { lineHeight: "1.25" }],
        base: ["0.875rem", { lineHeight: "1.6" }],
        lg: ["1rem", { lineHeight: "1.6" }],
        xl: ["1.125rem", { lineHeight: "1.5", letterSpacing: "-0.01em" }],
        "2xl": ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.02em" }],
        "3xl": ["1.5rem", { lineHeight: "1.2", letterSpacing: "-0.025em" }],
        "4xl": ["2rem", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        "5xl": ["2.5rem", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
        "6xl": ["3rem", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "7xl": ["4rem", { lineHeight: "1", letterSpacing: "-0.045em" }],
        "8xl": ["6rem", { lineHeight: "0.95", letterSpacing: "-0.05em" }],
        "9xl": ["10rem", { lineHeight: "0.9", letterSpacing: "-0.06em" }],
      },
      letterSpacing: {
        tighter: "-0.06em",
        tight: "-0.04em",
        normal: "-0.025em",
        wide: "0.05em",
        wider: "0.1em",
        widest: "0.15em",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(200%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
        },
        "ping-slow": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "80%, 100%": { transform: "scale(2.2)", opacity: "0" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
        "spin-reverse": {
          to: { transform: "rotate(-360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.3s ease-out forwards",
        "fade-slide-up": "fade-slide-up 0.5s cubic-bezier(0.25,0,0,1) forwards",
        shimmer: "shimmer 1.8s infinite",
        float: "float 8s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "ping-slow": "ping-slow 2.5s cubic-bezier(0, 0, 0.2, 1) infinite",
        "pulse-subtle": "pulse-subtle 1.8s ease-in-out infinite",
        "orbit-slow": "spin 10s linear infinite",
        "orbit-reverse": "spin-reverse 15s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;