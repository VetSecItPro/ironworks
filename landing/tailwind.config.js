/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./landing/**/*.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
        display: ['Cabinet Grotesk', 'Geist', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: { 0: '#0a0a0a', 1: '#141414', 2: '#1e1e1e', 3: '#282828' },
        accent: { DEFAULT: '#3b82f6', dim: '#1d4ed8' },
      }
    }
  }
}
