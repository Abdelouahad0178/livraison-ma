/**
 * Composants UI réutilisables avec le style Hero AI
 */

import { ReactNode } from 'react'
import { HERO_CARD, HERO_BUTTON, HERO_STAT_CARD } from '../styles/heroTheme'

// =============== CARDS ===============

interface HeroCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function HeroCard({ children, className = '', onClick }: HeroCardProps) {
  return (
    <div
      className={`${HERO_CARD.base} ${HERO_CARD.padding} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface HeroCardHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
}

export function HeroCardHeader({ title, subtitle, icon, action }: HeroCardHeaderProps) {
  return (
    <div className={HERO_CARD.header}>
      <div className="flex items-center gap-3">
        {icon && <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">{icon}</div>}
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// =============== BUTTONS ===============

interface HeroButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  icon?: ReactNode
}

export function HeroButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  icon
}: HeroButtonProps) {
  const baseClass = HERO_BUTTON[variant]
  const sizeClass = size === 'sm' ? HERO_BUTTON.sm : size === 'lg' ? HERO_BUTTON.lg : ''

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${sizeClass} ${className} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
    >
      {icon && icon}
      {children}
    </button>
  )
}

// =============== STAT CARDS ===============

interface HeroStatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  iconBg?: string
  iconColor?: string
  onClick?: () => void
  className?: string
}

export function HeroStatCard({
  label,
  value,
  icon,
  iconBg = 'bg-blue-100',
  iconColor = 'text-blue-600',
  onClick,
  className = ''
}: HeroStatCardProps) {
  return (
    <div
      className={`${HERO_STAT_CARD.container} ${onClick ? 'cursor-pointer hover:scale-105' : ''} ${className}`}
      onClick={onClick}
    >
      {icon && (
        <div className={`${HERO_STAT_CARD.icon} ${iconBg}`}>
          <div className={iconColor}>{icon}</div>
        </div>
      )}
      <div className={HERO_STAT_CARD.value}>{value}</div>
      <div className={HERO_STAT_CARD.label}>{label}</div>
    </div>
  )
}

// =============== INPUT FIELDS ===============

interface HeroInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  className?: string
  error?: string
  icon?: ReactNode
}

export function HeroInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  className = '',
  error,
  icon
}: HeroInputProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`w-full ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 bg-white border-2 ${
            error ? 'border-red-300' : 'border-gray-200'
          } rounded-xl focus:outline-none focus:border-blue-500 transition-colors`}
        />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

interface HeroSelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
  className?: string
  error?: string
}

export function HeroSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
  className = '',
  error
}: HeroSelectProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full px-4 py-3 bg-white border-2 ${
          error ? 'border-red-300' : 'border-gray-200'
        } rounded-xl focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

// =============== SECTION ===============

interface HeroSectionProps {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function HeroSection({ title, subtitle, children, className = '', action }: HeroSectionProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  )
}

// =============== BADGE ===============

interface HeroBadgeProps {
  children: ReactNode
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'gray'
  className?: string
}

export function HeroBadge({ children, variant = 'gray', className = '' }: HeroBadgeProps) {
  const colors = {
    primary: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-700'
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold ${colors[variant]} ${className}`}>
      {children}
    </span>
  )
}
