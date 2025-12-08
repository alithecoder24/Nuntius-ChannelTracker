import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      colors: {
        'nuntius': {
          'bg': '#0a0a0f',
          'card': 'rgba(20, 16, 32, 0.6)',
          'panel': 'rgba(15, 12, 25, 0.5)',
          'input': 'rgba(30, 24, 48, 0.8)',
          'border': 'rgba(168, 85, 247, 0.15)',
          'border-hover': 'rgba(168, 85, 247, 0.3)',
          'primary': '#a855f7',
          'primary-light': '#c084fc',
          'primary-dark': '#7c3aed',
          'accent': '#e879f9',
          'text': '#f8fafc',
          'text-muted': '#a1a1aa',
          'text-dim': '#71717a',
          'success': '#22c55e',
          'warning': '#f59e0b',
          'error': '#ef4444',
        }
      },
      fontFamily: {
        'sans': ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        'glass': '20px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(168, 85, 247, 0.4)',
        'glow-strong': '0 0 40px rgba(168, 85, 247, 0.6)',
        'card': '0 4px 40px rgba(0, 0, 0, 0.4), 0 0 80px rgba(168, 85, 247, 0.1)',
      }
    },
  },
  plugins: [],
}
export default config
