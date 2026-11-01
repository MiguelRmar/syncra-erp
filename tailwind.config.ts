import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand-color, #2563eb)",
          hover: "var(--brand-hover, #1d4ed8)",
          light: "var(--brand-light, rgba(37, 99, 235, 0.1))",
        },
      },
    },
  },
  plugins: [],
};

export default config;