// ============================================================
// RISO HUB Mobile — src/theme.ts
// Brand colours and font constants — mirrors web branding
// ============================================================

export const COLOURS = {
  olive: '#7A8465',
  oliveLight: '#9DA889',
  oliveFaint: '#f0f1ec',
  cream: '#F5F5F2',
  neutral1: '#DBD2C4',
  neutral2: '#C9C8BE',
  dark: '#333333',
  white: '#ffffff',
  // Status
  success: '#16a34a',
  successBg: '#f0fdf4',
  warning: '#ca8a04',
  warningBg: '#fffbeb',
  error: '#dc2626',
  errorBg: '#fef2f2',
  info: '#2563eb',
  infoBg: '#eff6ff',
  // EPC ratings
  epcA: '#00a550',
  epcB: '#50b848',
  epcC: '#aacf44',
  epcD: '#f5d327',
  epcE: '#f4a11d',
  epcF: '#ed7a1f',
  epcG: '#e31d23',
};

export const FONTS = {
  regular: 'System',
  bold: 'System',
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
};

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const PROJECT_STATUS_COLOURS: Record<string, string> = {
  survey: '#7A8465',
  design: '#9DA889',
  install: '#B8C4A4',
  commission: '#6B7A5C',
  audit: '#4A5740',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  survey: 'Survey',
  design: 'Design',
  install: 'Install',
  commission: 'Commission',
  audit: 'Audit',
};
