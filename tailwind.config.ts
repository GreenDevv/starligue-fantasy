import type { Config } from "tailwindcss";

// Palette & typographie : ARCHITECTURE.md §8.1
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0E1116", // fond principal (quasi-noir bleuté)
        surface: "#171C24", // cartes
        border: "#262D38",
        accent: {
          DEFAULT: "#2DD4BF", // teal — accent primaire
          secondary: "#F59E0B", // ambre — points, valeurs, alertes deadline
        },
        points: {
          pos: "#34D399",
          neg: "#F87171",
        },
        text: {
          DEFAULT: "#F1F5F9",
          muted: "#94A3B8",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"], // Barlow Condensed
        sans: ["var(--font-sans)", "system-ui", "sans-serif"], // Inter
        arcade: ["var(--font-arcade)", "monospace"], // VT323 — readouts LCD (points, deadline, prix)
      },
      boxShadow: {
        // Halos "borne d'arcade" — usage ponctuel sur CTA/état actif, pas partout (fatigue visuelle)
        "glow-accent": "0 0 16px rgba(45,212,191,0.45)",
        "glow-amber": "0 0 16px rgba(245,158,11,0.45)",
        "glow-red": "0 0 16px rgba(248,113,113,0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
