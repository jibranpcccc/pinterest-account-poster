/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pinterest: {
          red: '#E60023',
          darkRed: '#AD081B',
        },
        slate: {
          950: '#0B0F19',
        }
      },
    },
  },
  plugins: [],
}
