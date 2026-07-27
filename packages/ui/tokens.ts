// Starff brand tokens — the single source of visual truth.
// These match the live WordPress site (starff.co.uk) so every app looks the same.
// Import from here in every portal and the mobile app.

export const colors = {
  navy: "#0F172A", // primary dark / headers
  blue: "#2563EB", // electric blue — primary action
  orange: "#F97316", // safety orange — accent / highlights
  lightGrey: "#F8FAFC", // page background
  text: "#1E293B",
  muted: "#64748B",
  border: "#E2E8F0",
  white: "#FFFFFF",
} as const;

export const fonts = {
  // Avenir Next stack with Mulish (Google) fallback; Space Mono for rates/numbers.
  sans: `"Avenir Next", "Mulish", system-ui, sans-serif`,
  mono: `"Space Mono", ui-monospace, monospace`,
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
} as const;
