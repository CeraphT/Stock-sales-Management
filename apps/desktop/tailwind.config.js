/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // RGB-channel CSS variables (see src/index.css) exposed with an
      // <alpha-value> slot so opacity modifiers (bg-primary/10, text-success/70)
      // work and the whole palette swaps via the `.dark` class.
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-dark": "rgb(var(--color-primary-dark) / <alpha-value>)",
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        "text-primary": "rgb(var(--color-text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--color-text-secondary) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        "accent-blue": "rgb(var(--color-accent-blue) / <alpha-value>)",
        "accent-purple": "rgb(var(--color-accent-purple) / <alpha-value>)",
        "accent-amber": "rgb(var(--color-accent-amber) / <alpha-value>)",
        "accent-orange": "rgb(var(--color-accent-orange) / <alpha-value>)",
      },
      borderRadius: {
        card: "18px",
      },
      fontFamily: {
        sans: ['"Segoe UI"', "system-ui", "-apple-system", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
