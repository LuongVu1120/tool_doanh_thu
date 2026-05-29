'use client'

import { ThemeProvider } from 'next-themes'
import { QueryProvider } from '@/components/providers/query-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </QueryProvider>
  )
}
