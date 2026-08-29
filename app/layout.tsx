import type { Metadata } from 'next'
import BottomNav from '@/components/BottomNav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tonight',
  description: 'See who is out tonight',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, paddingBottom: '80px', background: '#f9f9f9', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', minHeight: '100vh', background: '#fff' }}>
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  )
}