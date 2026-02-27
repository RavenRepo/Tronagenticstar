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
          DEFAULT: "hsl(var(--color-brand) / <alpha-value>)",
          light: "hsl(var(--color-brand-light) / <alpha-value>)",
          dark: "hsl(var(--color-brand-dark) / <alpha-value>)",
          muted: "hsl(var(--color-brand-muted) / <alpha-value>)",
        },
        bg: {
          primary: "hsl(var(--color-bg-primary) / <alpha-value>)",
          secondary: "hsl(var(--color-bg-secondary) / <alpha-value>)",
          tertiary: "hsl(var(--color-bg-tertiary) / <alpha-value>)",
          hover: "hsl(var(--color-bg-hover) / <alpha-value>)",
          active: "hsl(var(--color-bg-active) / <alpha-value>)",
        },
        border: {
          DEFAULT: "hsl(var(--color-border) / <alpha-value>)",
          light: "hsl(var(--color-border-light) / <alpha-value>)",
          focus: "hsl(var(--color-border-focus) / <alpha-value>)",
        },
        text: {
          primary: "hsl(var(--color-text-primary) / <alpha-value>)",
          secondary: "hsl(var(--color-text-secondary) / <alpha-value>)",
          tertiary: "hsl(var(--color-text-tertiary) / <alpha-value>)",
          disabled: "hsl(var(--color-text-disabled) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
