/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefcf3",
          100: "#d6f6e2",
          200: "#aeebc8",
          300: "#7adaa8",
          400: "#45c084",
          500: "#1fa568",
          600: "#128753", // primary brand green
          700: "#0e6b43",
          800: "#0d5537",
          900: "#0b452e",
        },
        // Dark-mode palette: shades of deep green instead of neutral gray.
        // night-950/900 are surfaces (page bg / card bg), night-800/700 are
        // borders and hover states, night-400/300 are muted/lighter-green
        // text — light green is the secondary accent on top of dark green.
        night: {
          950: "#03130c", // page background
          900: "#071f15", // card / input background
          800: "#0c2c1e", // hover surface / badge bg
          700: "#123c28", // borders
          600: "#1a5033", // stronger borders / hover borders
          500: "#276b45", // subtle accents
          400: "#5fa27d", // muted text
          300: "#93cdac", // lighter-green muted text (secondary accent)
          200: "#c4e8d3", // near-white green, emphasis text
          100: "#e6f8ee", // brightest text on dark
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.06)",
        modal: "0 12px 40px rgba(16, 24, 40, 0.18)",
      },
      borderRadius: {
        xl2: "18px",
      },
    },
  },
  plugins: [],
};
