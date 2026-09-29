import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    /**
     * 3-Tier Responsive Breakpoint System
     * - mobile: 0-767px (default, no prefix needed)
     * - tablet: 768-1279px (md: prefix)
     * - desktop: 1280px+ (xl: prefix)
     *
     * Custom aliases for semantic usage:
     * - tablet: 768px (same as md)
     * - desktop: 1280px (same as xl)
     */
    screens: {
      'sm': '640px',
      'md': '768px',      // Tablet starts
      'tablet': '768px',  // Alias for md (semantic)
      'lg': '1024px',
      'xl': '1280px',     // Desktop starts
      'desktop': '1280px', // Alias for xl (semantic)
      '2xl': '1536px',
    },
    extend: {
      // 폰트 패밀리
      fontFamily: {
        'poppins': ['Poppins', 'sans-serif'],
      },

      // 색상 시스템 - 의미론적 토큰
      colors: {
        // Primary Brand Color
        primary: {
          50: '#e6f4ff',
          100: '#bae0ff',
          200: '#91caff',
          300: '#69b4ff',
          400: '#4098ff',
          500: '#2691d9', // 메인 브랜드 색상
          600: '#1a6bb3',
          700: '#0f4c8c',
          800: '#073366',
          900: '#021f40',
        },

        // Status Colors
        status: {
          processing: '#f59e0b',  // Amber
          summarizing: '#3b82f6', // Blue
          completed: '#10b981',   // Green
          error: '#dc3545',       // Red
        },

        // Neutral Colors
        neutral: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#666666',
          700: '#404040',
          750: '#2d2d2d', // Dark mode hover state
          800: '#262626',
          900: '#171717',
        },

        // Gradient Start/End Points
        gradient: {
          purple: {
            start: '#667eea',
            end: '#764ba2',
          },
          blue: {
            start: '#4facfe',
            end: '#00f2fe',
          },
          sky: {
            light: '#f0f7fe',
            DEFAULT: '#e6f0fd',
          },
          amber: {
            light: '#fff3e0',
            DEFAULT: '#ffe0b2',
          },
        },
      },

      // Border Radius - 표준화된 값
      borderRadius: {
        'xs': '4px',
        'sm': '8px',
        'DEFAULT': '12px',
        'md': '12px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
        'full': '9999px',
      },

      // Box Shadow - 일관된 고도 시스템
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 2px 4px rgba(0, 0, 0, 0.1)',
        'DEFAULT': '0 2px 10px rgba(0, 0, 0, 0.1)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        'lg': '0 6px 20px rgba(0,0,0,0.12)',
        'xl': '0 10px 15px rgba(0,0,0,0.15)',
        '2xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        'sidebar': '10px 10px 15px rgba(0,0,0,0.05)',
        'glow-amber': '0 0 8px rgba(251, 191, 36, 0.6)',
        'glow-blue': '0 0 8px rgba(59, 130, 246, 0.6)',
        'glow-green': '0 0 8px rgba(16, 185, 129, 0.6)',
        // Dark mode shadows
        'dark-sm': '0 2px 8px rgba(0, 0, 0, 0.5)',
        'dark-md': '0 4px 12px rgba(0, 0, 0, 0.5)',
        'dark-lg': '0 8px 24px rgba(0, 0, 0, 0.5)',
        'dark-xl': '0 12px 32px rgba(0, 0, 0, 0.7)',
        'dark-2xl': '0 20px 40px rgba(0, 0, 0, 0.7)',
      },

      // Spacing - 추가 간격 값
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        // Sidebar widths for 3-tier responsive
        'sidebar-collapsed': '64px',  // w-16 (tablet)
        'sidebar-expanded': '256px',  // w-64 (desktop)
        // Safe area aware spacing
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
      },

      // Width utilities for sidebar
      width: {
        'sidebar-collapsed': '64px',
        'sidebar-expanded': '256px',
      },

      // Margin utilities for main content
      margin: {
        'sidebar-collapsed': '64px',
        'sidebar-expanded': '256px',
      },

      // Z-index 레이어 시스템
      zIndex: {
        'sidebar': '1000',
        'modal': '1050',
        'tooltip': '1100',
        'dropdown': '1000',
        'fab': '900',
        'mobile-header': '950',
      },

      // Background Gradients
      backgroundImage: {
        'gradient-purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-blue': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'gradient-sky': 'linear-gradient(135deg, #f0f7fe, #e6f0fd)',
        'gradient-amber': 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
        'gradient-purple-vertical': 'linear-gradient(to bottom, #667eea, #764ba2)',
        // Dark mode gradients
        'gradient-dark': 'linear-gradient(135deg, #171717 0%, #262626 100%)',
        'gradient-dark-subtle': 'linear-gradient(135deg, #262626 0%, #404040 100%)',
      },

      // Animation & Transitions
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
      },

      // Typography - Responsive scales using clamp()
      fontSize: {
        'xxs': '0.625rem',  // 10px
        // Responsive text utilities
        'responsive-xs': ['clamp(0.625rem, 0.5rem + 0.5vw, 0.75rem)', { lineHeight: '1.4' }],
        'responsive-sm': ['clamp(0.75rem, 0.7rem + 0.5vw, 0.875rem)', { lineHeight: '1.5' }],
        'responsive-base': ['clamp(0.875rem, 0.8rem + 0.5vw, 1rem)', { lineHeight: '1.6' }],
        'responsive-lg': ['clamp(1rem, 0.9rem + 0.5vw, 1.125rem)', { lineHeight: '1.5' }],
        'responsive-xl': ['clamp(1.125rem, 1rem + 0.75vw, 1.25rem)', { lineHeight: '1.4' }],
        'responsive-2xl': ['clamp(1.25rem, 1.1rem + 1vw, 1.5rem)', { lineHeight: '1.3' }],
        'responsive-3xl': ['clamp(1.5rem, 1.25rem + 1.5vw, 1.875rem)', { lineHeight: '1.2' }],
        'responsive-4xl': ['clamp(1.875rem, 1.5rem + 2vw, 2.25rem)', { lineHeight: '1.1' }],
      },

      // Keyframes for mobile animations
      keyframes: {
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'slide-in-bottom': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-out-bottom': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'pulse-hint': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.5)', opacity: '0.5' },
        },
        // Tour demo animation keyframes
        'tour-cursor-move': {
          '0%': { transform: 'translate(0, 0)', opacity: '0' },
          '15%': { transform: 'translate(0, 0)', opacity: '1' },
          '40%': { transform: 'translate(var(--cursor-x, 30px), var(--cursor-y, 15px))' },
          '100%': { transform: 'translate(var(--cursor-x, 30px), var(--cursor-y, 15px))' },
        },
        'tour-cursor-click': {
          '0%, 40%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(0.85)' },
          '50%': { transform: 'scale(1)' },
          '65%': { transform: 'scale(0.85)' },
          '70%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1)' },
        },
        'tour-single-click': {
          '0%, 40%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(0.85)' },
          '50%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1)' },
        },
        'tour-arrow-rotate': {
          '0%, 30%': { transform: 'rotate(0deg)' },
          '60%, 100%': { transform: 'rotate(180deg)' },
        },
        'tour-demo-text-fade': {
          '0%, 35%': { opacity: '1' },
          '50%, 85%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'tour-demo-edit-appear': {
          '0%, 35%': { opacity: '0', transform: 'scale(0.98)' },
          '50%, 85%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.98)' },
        },
        'tour-spotlight-appear': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'tour-tooltip-enter': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },

      // Animation utilities
      animation: {
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'slide-out-left': 'slide-out-left 0.3s ease-in',
        'slide-in-bottom': 'slide-in-bottom 0.3s ease-out',
        'slide-out-bottom': 'slide-out-bottom 0.3s ease-in',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-in',
        'pulse-hint': 'pulse-hint 2s ease-in-out infinite',
        // Tour animations
        'tour-cursor-move': 'tour-cursor-move 3s ease-in-out infinite',
        'tour-cursor-click': 'tour-cursor-click 3s ease-in-out infinite',
        'tour-single-click': 'tour-single-click 3s ease-in-out infinite',
        'tour-arrow-rotate': 'tour-arrow-rotate 3s ease-in-out infinite',
        'tour-demo-text-fade': 'tour-demo-text-fade 3s ease-in-out infinite',
        'tour-demo-edit-appear': 'tour-demo-edit-appear 3s ease-in-out infinite',
        'tour-spotlight-appear': 'tour-spotlight-appear 0.3s ease-out forwards',
        'tour-tooltip-enter': 'tour-tooltip-enter 0.3s ease-out forwards',
      },

      // Line Clamp
      lineClamp: {
        2: '2',
        3: '3',
        4: '4',
      },
    },
  },
  plugins: [],
}
export default config 