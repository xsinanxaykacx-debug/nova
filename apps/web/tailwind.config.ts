import type { Config } from "tailwindcss";
const config: Config = { darkMode: "class", content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { nova: { ink: "#080B14", panel: "#111827", violet: "#8B5CF6", cyan: "#22D3EE" } }, boxShadow: { glow: "0 0 40px rgba(139, 92, 246, 0.18)" } } }, plugins: [] };
export default config;
