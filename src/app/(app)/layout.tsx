'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { UserRow } from '@/types/database'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<UserRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/login')
        return
      }

      // Load user profile from users table
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profile) {
        setUser(profile)
      } else {
        // User exists in auth but not in users table → create profile
        const newUser = {
          id: authUser.id,
          email: authUser.email!,
          full_name: (authUser.user_metadata.full_name as string) || null,
          avatar_url: (authUser.user_metadata.avatar_url as string) || null,
          role: 'viewer' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        await supabase.from('users').insert(newUser)
        setUser(newUser)
      }

      setLoading(false)
    }

    loadUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header
        user={user}
        onMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <main
        className={cn(
          'pt-14 transition-all duration-200',
          // Desktop offset for sidebar
          sidebarCollapsed ? 'lg:pl-14' : 'lg:pl-56'
        )}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
