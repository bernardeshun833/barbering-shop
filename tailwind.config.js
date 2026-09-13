/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      spacing: {
        touch: "3.5rem" // minimum touch target for the tablet UI
      }
    }
  },
  plugins: []
};
