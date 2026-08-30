'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Tonight', href: '/tonight' },
    { name: 'Post', href: '/post' },
    { name: 'Ranks', href: '/ranks' },
    { name: 'Profile', href: '/profile' },
  ]

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
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
      {tabs.map((tab) => {
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