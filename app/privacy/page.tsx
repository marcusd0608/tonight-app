import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <Link href="/profile" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 0.9rem', borderRadius: '10px', border: '1px solid #d1d5db', background: '#fff', color: '#111827', textDecoration: 'none', fontWeight: 700 }}>
          ← Back
        </Link>
        <h1 style={{ margin: 0 }}>Privacy Policy</h1>
      </div>
      <p>Tonight stores the profile details, photos, event posts, connection requests, and safety reports you choose to submit.</p>
      <h2>How information is used</h2>
      <p>Profile and post information is used to show community activity, connect users, and provide the app&apos;s safety tools. Instagram handles are revealed only after an accepted connection.</p>
      <h2>Safety information</h2>
      <p>Block records are used to keep blocked users out of each other&apos;s feeds. Reports are available to authorized administrators for review.</p>
      <h2>Control</h2>
      <p>You can edit profile information, delete your own posts, and unblock users from your Profile page.</p>
    </main>
  )
}
