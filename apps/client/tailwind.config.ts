import type { Config } from 'tailwindcss';

// Brand colours match the live WordPress site (starff.co.uk).
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0F172A',
        brand: '#2563EB', // electric blue — primary action
        orange: '#F97316', // safety orange — accent
        lightgrey: '#F8FAFC',
        ink: '#1E293B',
        muted: '#64748B',
        line: '#E2E8F0',
      },
    },
  },
  plugins: [],
} satisfies Config;
