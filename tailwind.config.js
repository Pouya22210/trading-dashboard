/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          primary:   '#171717',
          secondary: '#1e1e1e',
          tertiary:  '#2e2e2e',
          card:      '#222222',
          border:    'rgba(255,255,255,0.08)',
        },
        accent: {
          green:  '#ADFF2F',
          blue:   '#0A84FF',
          cyan:   '#ADFF2F',
          purple: '#BF5AF2',
          orange: '#FF9F0A',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backdropBlur: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '20px',
        xl: '40px',
      },
    },
  },
  plugins: [],
}
