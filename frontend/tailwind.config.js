/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {
    colors: {
      primary: { DEFAULT: 'var(--accent)', 50: 'var(--accent-muted)', 100: 'var(--accent-muted)', 200: 'var(--accent-muted)', 300: 'var(--accent)', 400: 'var(--accent)', 500: 'var(--accent)', 600: 'var(--accent-hover)', 700: 'var(--accent-press)', 800: 'var(--accent-line)', 900: 'var(--accent-line)' },
      accent: { DEFAULT: 'var(--accent)', yellow: 'var(--warn)', orange: 'var(--warn)' },
      background: { DEFAULT: 'var(--bg-canvas)', card: 'var(--bg-surface)' },
      surface: 'var(--bg-surface)', foreground: 'var(--text)', muted: 'var(--bg-inset)', border: 'var(--border)',
      success: 'var(--ok)', warning: 'var(--warn)', danger: 'var(--err)', info: 'var(--text-2)',
    },
    fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
    borderRadius: { DEFAULT: 'var(--r-1)', sm: 'var(--r-1)', md: 'var(--r-1)', lg: 'var(--r-2)', xl: 'var(--r-2)', '2xl': 'var(--r-2)' },
    boxShadow: { card: 'none', 'card-hover': 'none' },
  } }, plugins: [],
}
