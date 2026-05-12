/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All dark.* tones collapse onto the single neumorphism surface
        // so any leftover `bg-dark-*` / `from-dark-*` / `to-dark-*`
        // utilities render as a flat neumorphism background.
        dark: {
          primary:   '#252830',
          secondary: '#252830',
          tertiary:  '#252830',
          card:      '#252830',
          border:    'rgba(255,255,255,0.025)',
        },
        accent: {
          green:  '#ADFF2F',
          blue:   '#4DA8FF',
          cyan:   '#ADFF2F',
          purple: '#C589F2',
          orange: '#FFB35C',
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
