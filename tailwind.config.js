/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B1F3A",
        offblack: "#0B0E11",
        paneldark: "#1E2329",
        graphite: "#2B3139",
        canvas: "#0B0E11",
        soft: "#FAFAFA",
        gold: "#FCD535",
        ink: "#EAECEF",
      },
      boxShadow: {
        panel: "0 18px 42px -28px rgba(11, 31, 58, 0.48)",
        hard: "0 1px 0 rgba(255, 255, 255, 0.04)",
      },
      fontFamily: {
        sans: [
          "Songti SC",
          "STSong",
          "SimSun",
          "Noto Serif CJK SC",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        number: [
          "Songti SC",
          "STSong",
          "SimSun",
          "Noto Serif CJK SC",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
