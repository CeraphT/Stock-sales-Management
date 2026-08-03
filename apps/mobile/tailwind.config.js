/** @type {import('tailwindcss').Config} */

// Every color is a CSS variable (RGB triplet) so `dark:`-aware screens get
// the right value automatically — see src/global.css for the light/.dark
// variable definitions, and src/lib/theme/store.ts for how NativeWind's
// colorScheme is toggled between them.
function withOpacity(variable) {
  return ({ opacityValue }) =>
    opacityValue !== undefined ? `rgb(var(${variable}) / ${opacityValue})` : `rgb(var(${variable}))`;
}

module.exports = {
  darkMode: "class",
  content: ["./src/app/**/*.{js,jsx,ts,tsx}", "./src/components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: withOpacity("--color-primary"), dark: withOpacity("--color-primary-dark") },
        background: withOpacity("--color-background"),
        surface: withOpacity("--color-surface"),
        "text-primary": withOpacity("--color-text-primary"),
        "text-secondary": withOpacity("--color-text-secondary"),
        border: withOpacity("--color-border"),
        error: withOpacity("--color-error"),
        success: withOpacity("--color-success"),
        "accent-blue": { DEFAULT: withOpacity("--color-accent-blue"), soft: withOpacity("--color-accent-blue-soft") },
        "accent-purple": { DEFAULT: withOpacity("--color-accent-purple"), soft: withOpacity("--color-accent-purple-soft") },
        "accent-amber": { DEFAULT: withOpacity("--color-accent-amber"), soft: withOpacity("--color-accent-amber-soft") },
        "accent-orange": { DEFAULT: withOpacity("--color-accent-orange"), soft: withOpacity("--color-accent-orange-soft") },
      },
    },
  },
  plugins: [],
};
