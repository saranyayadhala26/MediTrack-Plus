/**
 * MediTrack+ Master Design System & Accessible Theme Tokens
 * Clean, modern healthcare aesthetic based on the finalized MediTrack+ UI design specification.
 */

export const colors = {
  // Brand - MediTrack+ Healthcare Teal
  primary: "#0D9488",
  primaryDark: "#0F766E",
  primaryLight: "#CCFBF1",
  primaryHover: "#14B8A6",
  primarySubtle: "#F0FDFA",

  // Clinical Blue Accents
  secondary: "#0284C7",
  secondaryDark: "#0369A1",
  secondaryLight: "#E0F2FE",

  // Neutrals & Surfaces
  background: "#F8FAFC", // Clean, light healthcare canvas
  surface: "#FFFFFF",
  surfaceSubtle: "#F1F5F9",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderStrong: "#CBD5E1",

  // Typography
  textPrimary: "#0F172A", // Dark Navy
  textSecondary: "#64748B", // Muted Slate
  textMuted: "#94A3B8",
  textInverse: "#FFFFFF",

  // Accessible Status Indicators
  taken: "#16A34A",
  takenLight: "#DCFCE7",
  skipped: "#DC2626",
  skippedLight: "#FEE2E2",
  snoozed: "#D97706",
  snoozedLight: "#FEF3C7",
  due: "#0D9488",
  dueLight: "#CCFBF1",

  // Feedback & Alerts
  success: "#16A34A",
  successLight: "#DCFCE7",
  warning: "#D97706",
  warningLight: "#FEF3C7",
  warningDark: "#B45309",
  critical: "#DC2626",
  criticalLight: "#FEE2E2",
  error: "#DC2626",
  danger: "#DC2626",
  dangerLight: "#FEE2E2",
  info: "#0284C7",
  infoLight: "#E0F2FE",
};

export const typography = {
  screenTitle: {
    fontSize: 24,
    fontWeight: "800" as const,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    lineHeight: 22,
  },
  bodySecondary: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 16,
  },
  small: {
    fontSize: 11,
    fontWeight: "500" as const,
    lineHeight: 15,
  },
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
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const accessibility = {
  minTouchTarget: 44, // Minimum 44px touch target per Master UI guidelines
};

export const shadows = {
  subtle: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  fab: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
};
