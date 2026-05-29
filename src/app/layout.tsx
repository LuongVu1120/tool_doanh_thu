import type { Metadata } from 'next'
import { AppProviders } from '@/components/providers/app-providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'HuyK Tools',
    template: '%s | HuyK Tools',
  },
  description: 'Hệ thống công cụ nội bộ cho đội ngũ HuyK Jewelry',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
