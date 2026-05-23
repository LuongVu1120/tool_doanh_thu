import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---- Period utilities ----

export function getCurrentPeriod(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function getPeriodLabel(period: string): string {
  const [year, month] = period.split('-')
  return `Tháng ${parseInt(month)}/${year}`
}

export function getPreviousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function getNextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month, 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// ---- Currency formatting ----

export function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrencyShort(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')} tỷ`
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(/\.?0+$/, '')}M`
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}k`
  }
  return amount.toString()
}

// ---- Date formatting ----

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

// ---- Tag normalization (legacy — use normalize() from sapo-parser for full Vietnamese) ----

export function normalizeVietnameseTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s*[-–]\s*/g, '-').replace(/\s+/g, ' ')
}
