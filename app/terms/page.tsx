import Link from 'next/link'

export default function TermsPage() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <Link href="/profile" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 0.9rem', borderRadius: '10px', border: '1px solid #d1d5db', background: '#fff', color: '#111827', textDecoration: 'none', fontWeight: 700 }}>
          ← Back
        </Link>
        <h1 style={{ margin: 0 }}>Terms of Service</h1>
      </div>
      <p>Tonight is a community app for sharing plans and connecting with people in your community.</p>
      <h2>Use of the service</h2>
      <p>Use a real account, share accurate information, and keep posts and messages respectful. Do not harass, threaten, impersonate, spam, or share unlawful content.</p>
      <h2>Moderation</h2>
      <p>We may remove content, restrict accounts, or suspend access when activity violates these terms or creates a safety risk.</p>
      <h2>Your content</h2>
      <p>You remain responsible for content you post. By posting, you allow Tonight to display it to authenticated users as part of the service.</p>
    </main>
  )
}
