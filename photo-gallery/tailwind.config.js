/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html'],
  theme: {
    extend: {
      colors: {
        bgPrimary: '#0a0a0a',
        bgSecondary: '#141414',
        textPrimary: '#f0ede8',
        textSecondary: '#9a9791',
        textDisabled: '#6b6864',
        accent: '#c9955a',
        borderColor: '#1e1e1e',
        disabled: '#555555',
        scrollbar: '#333333'
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['DM Serif Display', 'serif']
      }
    }
  },
  plugins: []
}
