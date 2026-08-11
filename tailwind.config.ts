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
        display: ["Space Grotesk", "Inter", "sans-serif"],
        heading: ["Space Grotesk", "Inter", "sans-serif"],
        body: ["Inter", "Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
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
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        full: "9999px",
      },
      boxShadow: {
        "glow-orange": "0 0 20px -5px rgba(234, 88, 12, 0.5)",
        "glow-orange-lg": "0 0 30px -5px rgba(247, 147, 26, 0.6)",
        "glow-gold": "0 0 20px rgba(255, 214, 0, 0.3)",
        "glow-card": "0 0 50px -10px rgba(247, 147, 26, 0.1)",
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1", letterSpacing: "0.05em" }],
        sm: ["0.875rem", { lineHeight: "1.25", letterSpacing: "0.025em" }],
        base: ["1rem", { lineHeight: "1.625" }],
        lg: ["1.125rem", { lineHeight: "1.625", letterSpacing: "0.01em" }],
        xl: ["1.25rem", { lineHeight: "1.625" }],
        "2xl": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        "3xl": ["2rem", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "4xl": ["2.5rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "5xl": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.025em" }],
        "6xl": ["4.5rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "7xl": ["6rem", { lineHeight: "1", letterSpacing: "-0.035em" }],
        "8xl": ["8rem", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "9xl": ["10rem", { lineHeight: "1", letterSpacing: "-0.045em" }],
      },
      letterSpacing: {
        tighter: "-0.05em",
        tight: "-0.025em",
        normal: "0",
        wide: "0.025em",
        wider: "0.05em",
        widest: "0.1em",
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
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
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
        float: "float 8s ease-in-out infinite",
        "orbit-slow": "spin 10s linear infinite",
        "orbit-reverse": "spin-reverse 15s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
