import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import BottomNav from '@/components/BottomNav'
import InstallPrompt from '@/components/InstallPrompt'
import PWARegister from '@/components/PWARegister'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tonight',
  description: 'See who is out tonight',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body style={{ margin: 0, paddingBottom: '80px', background: '#f9f9f9', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', minHeight: '100vh', background: '#fff' }}>
          {children}
        </div>
        <BottomNav />
        <InstallPrompt />
        <PWARegister />
        <Analytics />
      </body>
    </html>
  )
}