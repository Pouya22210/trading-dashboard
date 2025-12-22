/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          primary: '#0d1117',
          secondary: '#161b22',
          tertiary: '#21262d',
          card: '#1c2128',
          border: '#30363d',
        },
        accent: {
          blue: '#58a6ff',
          cyan: '#39d5ff',
          purple: '#a371f7',
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
