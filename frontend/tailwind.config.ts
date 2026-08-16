import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm near-black "void" scale, in place of a cool neutral gray —
        // this is a torchlit dungeon, not a trading terminal.
        ink: {
          950: "#150f0a",
          900: "#1c140d",
          800: "#241a10",
          700: "#332415",
          600: "#4a3820",
        },
        // Primary interactive accent: ember/burnt-orange, standing in for
        // the torchlight that's the only light source in this dungeon.
        ember: {
          300: "#e8b98a",
          400: "#dd9354",
          500: "#c1531f",
          600: "#8f3a14",
        },
        // Secondary accent for numerals, verdicts, and magic — an arcane
        // violet rune-glow rather than a gold wax seal.
        rune: {
          violet: "#8f74d6",
          "violet-light": "#a894e0",
        },
        amber: {
          400: "#d6a869",
          500: "#c4934a",
        },
        brick: {
          400: "#c47870",
          500: "#b1544a",
        },
        sage: {
          400: "#96b58a",
          500: "#7c9b6f",
        },
        parchment: "#e4e1d6",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
