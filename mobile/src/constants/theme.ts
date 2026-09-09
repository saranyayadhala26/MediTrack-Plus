/**
 * MediTrack+ Design System & Accessible Theme Tokens
 * Designed with senior accessibility, high contrast, and clean healthcare aesthetics.
 */

export const colors = {
  // Primary - Calm, trustworthy medical teal
  primary: "#0D9488",
  primaryDark: "#0F766E",
  primaryLight: "#CCFBF1",
  primaryHover: "#14B8A6",

  // Secondary - Clear clinical blue
  secondary: "#0284C7",
  secondaryDark: "#0369A1",
  secondaryLight: "#E0F2FE",

  // Neutrals & Surfaces
  background: "#F8FAFC", // Slate 50
  surface: "#FFFFFF",
  surfaceSubtle: "#F1F5F9", // Slate 100
  border: "#CBD5E1", // Slate 300 - high contrast border
  borderLight: "#E2E8F0",

  // Typography (High Contrast for Elderly Readers)
  textPrimary: "#0F172A", // Slate 900
  textSecondary: "#334155", // Slate 700
  textMuted: "#64748B", // Slate 500
  textInverse: "#FFFFFF",

  // Status Indicators
  taken: "#16A34A", // Green 600
  takenLight: "#DCFCE7",
  skipped: "#DC2626", // Red 600
  skippedLight: "#FEE2E2",
  snoozed: "#D97706", // Amber 600
  snoozedLight: "#FEF3C7",
  due: "#2563EB", // Blue 600
  dueLight: "#DBEAFE",

  // Feedback
  success: "#16A34A",
  warning: "#D97706",
  error: "#DC2626",
  danger: "#DC2626",
  dangerLight: "#FEE2E2",
  info: "#0284C7",
};

export const typography = {
  h1: {
    fontSize: 26,
    fontWeight: "700" as const,
    lineHeight: 34,
  },
  h2: {
    fontSize: 22,
    fontWeight: "700" as const,
    lineHeight: 28,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
    lineHeight: 24,
  },
  bodyLarge: {
    fontSize: 17,
    fontWeight: "400" as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 14,
    fontWeight: "500" as const,
    lineHeight: 18,
  },
  small: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 16,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const accessibility = {
  minTouchTarget: 48, // Minimum 48x48 dp touch target per WCAG guidelines
};
