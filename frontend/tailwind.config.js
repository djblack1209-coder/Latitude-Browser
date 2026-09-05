/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Keep the old class names working while moving them to Signal Noir. */
        primary: {
          50: '#effff4',
          100: '#d9ffe5',
          200: '#b7ffcc',
          300: '#8ff9ad',
          400: '#72f59a',
          500: 'var(--color-accent)',
          600: '#54e77e',
          700: '#36cb62',
          800: '#1e9f4a',
          900: '#11733a',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          yellow: 'var(--color-warning)',
          orange: 'var(--color-warning)',
        },
        background: {
          DEFAULT: 'var(--color-bg-base)',
          card: 'var(--color-bg-surface)',
        },
        surface: 'var(--color-bg-surface)',
        foreground: 'var(--color-text-primary)',
        muted: 'var(--color-bg-muted)',
        border: 'var(--color-border-default)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-error)',
        info: 'var(--color-info)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'SF Pro Text', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Noto Sans SC', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '0.875rem',
      },
      boxShadow: {
        card: 'var(--shadow-sm)',
        'card-hover': 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
}
