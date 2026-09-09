/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html'],
  theme: {
    extend: {
      colors: {
        bgPrimary: '#FAF8F4',
        bgSecondary: '#F1EDE6',
        textPrimary: '#201C16',
        textSecondary: '#6B645A',
        textDisabled: '#B8AE9C',
        accent: '#C75B39',
        borderColor: '#E7E1D6',
        disabled: '#C9C0B0',
        scrollbar: '#D2CABA'
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['DM Serif Display', 'serif']
      }
    }
  },
  plugins: []
}
