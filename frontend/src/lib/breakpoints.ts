/**
 * Breakpoint constants aligned with Tailwind CSS defaults
 * Used for responsive design and media query hooks
 *
 * 3-Tier Responsive System:
 * - Mobile: 0-767px (phones)
 * - Tablet: 768-1279px (tablets, small laptops)
 * - Desktop: 1280px+ (desktops, large screens)
 */

const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,    // Tablet starts
  lg: 1024,
  xl: 1280,   // Desktop starts
  '2xl': 1536,
} as const;

/**
 * Device-specific breakpoints for 3-tier responsive system
 */
const DEVICE_BREAKPOINTS = {
  mobile: { max: 767 },                    // 0-767px
  tablet: { min: 768, max: 1279 },         // 768-1279px
  desktop: { min: 1280 },                  // 1280px+
} as const;

/**
 * Media query strings for use in matchMedia API
 * Follows mobile-first approach
 */
export const MEDIA_QUERIES = {
  // Min-width queries (mobile-first)
  sm: `(min-width: ${BREAKPOINTS.sm}px)`,
  md: `(min-width: ${BREAKPOINTS.md}px)`,
  lg: `(min-width: ${BREAKPOINTS.lg}px)`,
  xl: `(min-width: ${BREAKPOINTS.xl}px)`,
  '2xl': `(min-width: ${BREAKPOINTS['2xl']}px)`,

  // 3-Tier Device-specific queries (NEW)
  mobile: `(max-width: ${DEVICE_BREAKPOINTS.mobile.max}px)`,
  tablet: `(min-width: ${DEVICE_BREAKPOINTS.tablet.min}px) and (max-width: ${DEVICE_BREAKPOINTS.tablet.max}px)`,
  desktop: `(min-width: ${DEVICE_BREAKPOINTS.desktop.min}px)`,

  // Combined queries for convenience
  mobileOrTablet: `(max-width: ${DEVICE_BREAKPOINTS.tablet.max}px)`,
  tabletOrDesktop: `(min-width: ${DEVICE_BREAKPOINTS.tablet.min}px)`,

  // Orientation queries
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',

  // Touch capability
  touch: '(hover: none) and (pointer: coarse)',
  mouse: '(hover: hover) and (pointer: fine)',
} as const;

/**
 * Device type for useDeviceType hook
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
