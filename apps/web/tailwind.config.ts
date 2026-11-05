import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        nova: { ink: "#07111F", panel: "#0B1728", navy: "#0F172A", sky: "#38BDF8", muted: "#94A3B8" },
      },
      boxShadow: { glow: "0 0 40px rgba(56, 189, 248, 0.16)" },
    },
  },
  plugins: [],
};
export default config;
