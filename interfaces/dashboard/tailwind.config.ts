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
          DEFAULT: "hsl(var(--color-brand))",
          light: "hsl(var(--color-brand-light))",
          dark: "hsl(var(--color-brand-dark))",
          muted: "hsl(var(--color-brand-muted))",
        },
        bg: {
          primary: "hsl(var(--color-bg-primary))",
          secondary: "hsl(var(--color-bg-secondary))",
          tertiary: "hsl(var(--color-bg-tertiary))",
          hover: "hsl(var(--color-bg-hover))",
          active: "hsl(var(--color-bg-active))",
        },
        border: {
          DEFAULT: "hsl(var(--color-border))",
          light: "hsl(var(--color-border-light))",
          focus: "hsl(var(--color-border-focus))",
        },
        text: {
          primary: "hsl(var(--color-text-primary))",
          secondary: "hsl(var(--color-text-secondary))",
          tertiary: "hsl(var(--color-text-tertiary))",
          disabled: "hsl(var(--color-text-disabled))",
        },
      },
    },
  },
  plugins: [],
};

export default config;
