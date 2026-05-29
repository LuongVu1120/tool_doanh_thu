'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Star,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  children?: Array<{
    href: string
    label: string
    icon: React.ComponentType<{ className?: string }>
  }>
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Tổng quan',
    icon: LayoutDashboard,
  },
  {
    href: '/revenue/sapo-team',
    label: 'Doanh thu Media',
    icon: TrendingUp,
    badge: 'Media',
    children: [
      { href: '/revenue/sapo-team', label: 'Sapo Team', icon: Sparkles },
      { href: '/revenue/sapo', label: 'Kết nối Sapo', icon: RefreshCw },
    ],
  },
  {
    href: '/chat',
    label: 'Chatbot AI',
    icon: MessageSquare,
    badge: 'Beta',
  },
]

function NavLink({
  href,
  label,
  icon: Icon,
  collapsed,
  badge,
  match = 'prefix',
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  collapsed: boolean
  badge?: string
  match?: 'exact' | 'prefix'
}) {
  const pathname = usePathname()
  const isActive =
    match === 'exact'
      ? pathname === href
      : href === '/'
        ? pathname === '/'
        : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group relative',
        isActive
          ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white',
        collapsed && 'justify-center px-2'
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-600 dark:text-blue-400' : '')} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded font-medium">
              {badge}
            </span>
          )}
        </>
      )}
      {/* Tooltip for collapsed state */}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
          {label}
        </div>
      )}
    </Link>
  )
}

function NavSection({
  item,
  collapsed,
}: {
  item: NavItem
  collapsed: boolean
}) {
  const hasChildren = item.children && item.children.length > 0

  if (!hasChildren || collapsed) {
    return (
      <NavLink
        href={item.href}
        label={item.label}
        icon={item.icon}
        collapsed={collapsed}
        badge={item.badge}
      />
    )
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
          'text-slate-600 dark:text-slate-400',
          collapsed && 'justify-center px-2'
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate font-medium">{item.label}</span>
            {item.badge && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded font-medium">
                {item.badge}
              </span>
            )}
          </>
        )}
      </div>
      {!collapsed && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 dark:border-slate-700 pl-3">
          {item.children?.map((child) => (
            <NavLink
              key={child.href}
              href={child.href}
              label={child.label}
              icon={child.icon}
              collapsed={false}
              match="exact"
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-14 bottom-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-200',
          // Mobile: full width overlay
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 lg:translate-x-0',
          // Desktop: collapsible
          collapsed ? 'lg:w-14' : 'lg:w-56'
        )}
      >
        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto scrollbar-thin">
          {!collapsed && (
            <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Công cụ
            </p>
          )}
          {navItems.map((item) => (
            <NavSection key={item.href} item={item} collapsed={collapsed} />
          ))}

          {/* Favorites section */}
          {!collapsed && (
            <>
              <div className="pt-2">
                <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Yêu thích
                </p>
                <div className="px-3 py-6 text-center">
                  <Star className="w-5 h-5 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                  <p className="text-xs text-slate-400">
                    Thêm công cụ yêu thích từ trang chủ
                  </p>
                </div>
              </div>
            </>
          )}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:flex p-2 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onToggle}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs w-full',
              collapsed ? 'justify-center' : ''
            )}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Thu gọn</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
