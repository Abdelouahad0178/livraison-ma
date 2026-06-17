/**
 * HERO AI Design System
 * Palette de couleurs et styles inspirés de heroai.ca
 */

export const HERO_COLORS = {
  // Primary Colors
  primary: {
    50: '#EFF6FF',   // Très clair
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',  // Bleu principal
    600: '#2563EB',
    700: '#1D4ED8',  // Bleu navy
    800: '#1E40AF',
    900: '#1E3A8A',  // Navy foncé
  },

  // Neutral Colors
  gray: {
    50: '#F9FAFB',   // Fond très clair
    100: '#F3F4F6',  // Fond de carte
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',  // Texte secondaire
    700: '#374151',
    800: '#1F2937',  // Texte principal
    900: '#111827',  // Très foncé
  },

  // Success, Warning, Error
  success: {
    50: '#ECFDF5',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  },
  warning: {
    50: '#FFFBEB',
    500: '#F59E0B',
    600: '#D97706',
  },
  error: {
    50: '#FEF2F2',
    500: '#EF4444',
    600: '#DC2626',
  },
}

export const HERO_SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
}

export const HERO_SPACING = {
  cardPadding: 'p-6',
  cardGap: 'gap-6',
  sectionGap: 'gap-8',
  containerPadding: 'px-6 py-8',
}

export const HERO_TYPOGRAPHY = {
  h1: 'text-4xl font-bold text-gray-900 tracking-tight',
  h2: 'text-3xl font-bold text-gray-900',
  h3: 'text-2xl font-semibold text-gray-800',
  h4: 'text-xl font-semibold text-gray-800',
  h5: 'text-lg font-semibold text-gray-700',
  body: 'text-base text-gray-600',
  bodyLarge: 'text-lg text-gray-600',
  bodySm: 'text-sm text-gray-500',
  label: 'text-sm font-medium text-gray-700',
}

export const HERO_CARD = {
  base: 'bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-100',
  padding: 'p-6',
  header: 'flex items-center justify-between mb-4 pb-4 border-b border-gray-100',
}

export const HERO_BUTTON = {
  primary: 'px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200',
  secondary: 'px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all duration-200',
  outline: 'px-6 py-3 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl transition-all duration-200',
  sm: 'px-4 py-2 text-sm',
  lg: 'px-8 py-4 text-lg',
}

export const HERO_STAT_CARD = {
  container: 'bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow',
  icon: 'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
  value: 'text-3xl font-bold text-gray-900 mb-1',
  label: 'text-sm font-medium text-gray-500 uppercase tracking-wide',
}
