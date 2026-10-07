/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        page: "#f4f4f2",
        surface: "#ffffff",
        fill: "#fafaf8",
        navy: {
          DEFAULT: "#111111",
          light: "#2454b8"
        },
        ink: {
          DEFAULT: "#111111",
          body: "#111111",
          secondary: "#545454",
          muted: "#545454",
          faint: "#666666",
          placeholder: "#757575"
        },
        line: {
          DEFAULT: "#d6d6d6",
          soft: "#e5e5e5",
          hair: "#c6c6c6"
        },
        num: "#c4bfb6",
        record: "#d24a3d"
      },
      fontFamily: {
        sans: ["Inter", "Arial", "Helvetica", "sans-serif"],
        serif: ["Georgia", "Times New Roman", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"]
      },
      boxShadow: {
        card: "0 1px 1px rgba(20,18,15,0.04), 0 2px 4px -1px rgba(20,18,15,0.07)"
      },
      maxWidth: {
        shell: "1180px"
      }
    }
  },
  plugins: []
};
