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
          primary:   '#000000',
          secondary: '#0a0a0a',
          tertiary:  'rgba(255,255,255,0.05)',
          card:      'rgba(255,255,255,0.04)',
          border:    'rgba(255,255,255,0.08)',
        },
        accent: {
          green:  '#30D158',
          blue:   '#0A84FF',
          cyan:   '#5AC8FA',
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
