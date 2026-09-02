'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Tonight', href: '/tonight' },
    { name: 'Posts', href: '/post' },
    { name: 'Ranks', href: '/ranks' },
    { name: 'Profile', href: '/profile' },
  ]

  return (
    <nav style={{
      position: 'fixed',
      bottom: 'env(safe-area-inset-bottom)',
      left: 0,
      right: 0,
      background: '#fff',
      borderTop: '1px solid #eaeaea',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '12px 0',
      maxWidth: '600px',
      margin: '0 auto',
      zIndex: 1000
    }}>
      {tabs.slice(0, 2).map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link 
            key={tab.name} 
            href={tab.href}
            style={{
              textDecoration: 'none',
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#000' : '#888',
              fontSize: '14px'
            }}
          >
            {tab.name}
          </Link>
        )
      })}
      <Link
        href="/create"
        aria-label="Create a post"
        style={{
          textDecoration: 'none',
          fontWeight: 'bold',
          color: '#fff',
          background: '#111827',
          borderRadius: '50%',
          width: '42px',
          height: '42px',
          display: 'grid',
          placeItems: 'center',
          fontSize: '28px',
          lineHeight: 1,
          marginTop: '-18px',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.22)'
        }}
      >
        +
      </Link>
      {tabs.slice(2).map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.name}
            href={tab.href}
            style={{
              textDecoration: 'none',
              fontWeight: isActive ? 'bold' : 'normal',
              color: isActive ? '#000' : '#888',
              fontSize: '14px'
            }}
          >
            {tab.name}
          </Link>
        )
      })}
    </nav>
  )
}