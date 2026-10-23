import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cai: {
          50: '#eff8f5',
          100: '#d9eee7',
          600: '#16856c',
          700: '#116b57',
          900: '#123d36',
        },
      },
      boxShadow: {
        card: '0 18px 55px -30px rgba(18, 61, 54, 0.25)',
      },
    },
  },
  plugins: [forms],
}
