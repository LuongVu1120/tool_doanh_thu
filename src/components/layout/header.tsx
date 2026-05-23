'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Gem,
  Search,
  Sun,
  Moon,
  Monitor,
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  User,
  Menu,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { UserRow } from '@/types/database'

interface HeaderProps {
  user: UserRow
  onMenuToggle?: () => void
}

export function Header({ user, onMenuToggle }: HeaderProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const avatarUrl = user.avatar_url
  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .slice(-2)
        .join('')
        .toUpperCase()
    : user.email[0].toUpperCase()

  return (
    <header className="sticky top-0 z-50 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 gap-4">
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
          <Gem className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-slate-900 dark:text-white hidden sm:block">
          HuyK Tools
        </span>
      </Link>

      {/* Search */}
      <div className="flex-1 max-w-md mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm công cụ..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-700 transition placeholder-slate-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications */}
        <button className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        {/* Theme switcher */}
        <div className="relative">
          <button
            onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {theme === 'dark' ? (
              <Moon className="w-4 h-4" />
            ) : theme === 'light' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </button>

          {themeDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setThemeDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20">
                {[
                  { value: 'light', label: 'Sáng', icon: Sun },
                  { value: 'dark', label: 'Tối', icon: Moon },
                  { value: 'system', label: 'Hệ thống', icon: Monitor },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setTheme(value)
                      setThemeDropdownOpen(false)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition ${
                      theme === value
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Avatar dropdown */}
        <div className="relative ml-1">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={user.full_name || user.email}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-semibold text-blue-600 dark:text-blue-400">
                {initials}
              </div>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-20">
                {/* User info */}
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {user.full_name || 'Người dùng'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                    {user.role === 'admin' ? 'Admin' : user.role === 'media' ? 'Media' : 'Viewer'}
                  </span>
                </div>

                <Link
                  href="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <User className="w-4 h-4" />
                  Hồ sơ cá nhân
                </Link>

                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <Settings className="w-4 h-4" />
                  Cài đặt
                </Link>

                <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Đăng xuất
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
