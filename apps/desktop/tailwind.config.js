/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colors are driven by CSS variables (see src/index.css) so the whole
      // palette swaps between light/dark by toggling the `.dark` class on
      // <html>. Values mirror @stockflow/core/theme/colors.ts (Expo palette).
      colors: {
        primary: "var(--color-primary)",
        "primary-dark": "var(--color-primary-dark)",
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        error: "var(--color-error)",
        success: "var(--color-success)",
        "accent-blue": "var(--color-accent-blue)",
        "accent-purple": "var(--color-accent-purple)",
        "accent-amber": "var(--color-accent-amber)",
        "accent-orange": "var(--color-accent-orange)",
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
