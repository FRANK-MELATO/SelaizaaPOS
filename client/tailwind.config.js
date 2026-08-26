module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          900: '#7c2d12'
        },
        brand: {
          DEFAULT: '#c2410c',
          light: '#f97316',
          dark: '#7c2d12'
        }
      }
    }
  },
  plugins: []
}
