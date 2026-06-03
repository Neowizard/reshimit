/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",    // Scans app/ directory
    "./components/**/*.{js,ts,jsx,tsx}", // Scans components/ directory
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};