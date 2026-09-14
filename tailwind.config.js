/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Near-black with a cool cast, so the warm gold reads as warm.
        ink: {
          900: "#07080A",
          800: "#0B0D11",
          700: "#12151A",
          600: "#181C23",
          500: "#232832"
        },
        gold: {
          100: "#F7EBD4",
          200: "#EFDCB8",
          300: "#E8C88A",
          400: "#D9B072",
          500: "#C89B52",
          600: "#A97F3C"
        },
        cream: "#F3EDE3"
      },
      fontFamily: {
        // No webfont: the tablet has to work offline on first load, and a
        // display face that arrives late looks worse than one that never
        // changes. These are the serifs Android and iOS actually ship.
        display: ["Georgia", "Times New Roman", "serif"]
      },
      spacing: {
        touch: "3.5rem" // minimum touch target for the tablet UI
      },
      boxShadow: {
        gold: "0 6px 20px -8px rgba(200, 155, 82, 0.55)"
      }
    }
  },
  plugins: []
};
