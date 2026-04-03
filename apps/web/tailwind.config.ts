import type { Config } from 'tailwindcss'

/**
 * SoundHaus Tailwind CSS v4 Configuration
 * Brand Bible v1.0 Implementation
 */

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  darkMode: ['class', '[data-theme="dark"]'],

  theme: {
    extend: {
      // SoundHaus Brand Palette (Extracted)
      colors: {
        // Background layers - neutral dark gray
        navy: '#0E0E0E',
        midnight: {
          DEFAULT: '#121212',
          400: '#2D2D2D', // Medium gray depth layer
        },
        charcoal: '#2D2D2D', // Secondary background

        // Brand accent - Icy Blue with glow
        'glass-blue': {
          DEFAULT: '#A7C7E7',
          400: '#9BBFE6',
          500: '#A7C7E7',
          600: '#8BAFD5',
          700: '#7099C3',
        },
        'glass-cyan': {
          DEFAULT: '#A7C7E7',
          400: '#9BBFE6',
          500: '#A7C7E7',
        },

        // Electric ice highlight for edges and glow
        'glass-highlight': '#CFE6FF',
        'soft-white': '#F0F4F8',

        // Cool gray-blue for subtle contrast
        muted: {
          DEFAULT: '#6F8FAF',
          300: '#8FA7BF',
          400: '#6F8FAF',
        },

        // Semantic colors with shade scales
        violet: {
          DEFAULT: '#8B5CF6',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
        success: {
          DEFAULT: '#22C55E',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        warning: {
          DEFAULT: '#F59E0B',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        error: {
          DEFAULT: '#EF4444',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
      },

      // Custom font sizes
      fontSize: {
        'h1': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'h1-mobile': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['32px', { lineHeight: '1.2', fontWeight: '600' }],
        'h2-mobile': ['24px', { lineHeight: '1.2', fontWeight: '600' }],
        'h3': ['24px', { lineHeight: '1.3', fontWeight: '500' }],
        'h3-mobile': ['20px', { lineHeight: '1.3', fontWeight: '500' }],
        'body': ['16px', { lineHeight: '1.5' }],
        'body-lg': ['18px', { lineHeight: '1.5' }],
        'label': ['14px', { lineHeight: '1.5' }],
        'caption': ['12px', { lineHeight: '1.4' }],
      },

      // Custom font families
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },

      // Custom spacing
      spacing: {
        'touch': '44px',
      },

      // Custom border radius
      borderRadius: {
        'btn': '4px',
        'card': '6px',
        'modal': '12px',
        'badge': '3px',
        'input': '6px',
      },

      // Custom easing functions
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },

      // Custom backdrop blur
      backdropBlur: {
        'glass': '12px',
      },

      // Custom z-index values
      zIndex: {
        'dropdown': '1000',
        'popover': '2000',
        'tooltip': '3000',
        'modal-backdrop': '4000',
        'modal': '4001',
      },

      // Custom elevation shadows
      boxShadow: {
        'elevation-2': '0 2px 4px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.12)',
        'elevation-3': '0 4px 8px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.12)',
        'elevation-4': '0 8px 16px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.12)',
      },

      // Custom keyframes
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-in-from-top': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'crossfade-in': {
            '0%': { opacity: '0', backdropFilter: 'blur(0px)', WebkitBackdropFilter: 'blur(0px)' },
            '100%': { opacity: '1', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' },
        },
        'remix-slide-up': {
          '0%': { opacity: '0', transform: 'translateY(24px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'copy-flash': {
          '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.6)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(34, 197, 94, 0.4)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' },
        },
        'checkmark-pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },

      // Custom animations
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        'slide-in-from-top': 'slide-in-from-top 0.2s ease-out',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'crossfade-in': 'crossfade-in 0.3s ease-out forwards',
        'remix-slide-up': 'remix-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'copy-flash': 'copy-flash 0.6s ease-out',
        'checkmark-pop': 'checkmark-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },

      // Custom max-width values
      maxWidth: {
        'modal-md': '500px',
      },
    },
  },

  plugins: [
    // Headless UI variant plugin
    function ({ addVariant }: any) {
      addVariant('ui-active', '&[data-headlessui-state~="active"]')
      addVariant('ui-disabled', '&[data-headlessui-state~="disabled"]')
    },
  ],
}

export default config
