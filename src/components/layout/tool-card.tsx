import Link from 'next/link'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCardProps {
  title: string
  description: string
  href: string
  icon: React.ReactNode
  badges?: string[]
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'slate'
  isNew?: boolean
  isBeta?: boolean
  isFavorited?: boolean
  onToggleFavorite?: () => void
  disabled?: boolean
  comingSoon?: boolean
}

const colorMap = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    icon: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950',
    icon: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400',
    badge: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    icon: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400',
    badge: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950',
    icon: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950',
    icon: 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    icon: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  },
}

export function ToolCard({
  title,
  description,
  href,
  icon,
  badges = [],
  color = 'blue',
  isNew,
  isBeta,
  isFavorited,
  onToggleFavorite,
  disabled,
  comingSoon,
}: ToolCardProps) {
  const colors = colorMap[color]

  const CardContent = (
    <div
      className={cn(
        'group relative flex flex-col p-5 rounded-xl border transition-all duration-200',
        disabled || comingSoon
          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-60 cursor-not-allowed'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
      )}
    >
      {/* Favorite button */}
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.preventDefault()
            onToggleFavorite()
          }}
          className={cn(
            'absolute top-3 right-3 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all',
            isFavorited
              ? 'opacity-100 text-yellow-500 hover:text-yellow-600'
              : 'text-slate-300 hover:text-yellow-400 dark:text-slate-600'
          )}
        >
          <Star className={cn('w-4 h-4', isFavorited && 'fill-current')} />
        </button>
      )}

      {/* Icon */}
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', colors.icon)}>
        {icon}
      </div>

      {/* Title + Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{title}</h3>
        {isNew && (
          <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded font-medium">
            Mới
          </span>
        )}
        {isBeta && (
          <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded font-medium">
            Beta
          </span>
        )}
        {comingSoon && (
          <span className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 rounded font-medium">
            Sắp ra mắt
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 flex-1">{description}</p>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {badges.map((badge) => (
            <span
              key={badge}
              className={cn('text-xs px-2 py-0.5 rounded-full font-medium', colors.badge)}
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </div>
  )

  if (disabled || comingSoon) {
    return CardContent
  }

  return <Link href={href}>{CardContent}</Link>
}
