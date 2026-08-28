import LogoutButton from '@/components/LogoutButton'

export default function FeedPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Tonight Feed</h1>
      <p>You are successfully logged in!</p>
      <div style={{ marginTop: '2rem' }}>
        <LogoutButton />
      </div>
    </main>
  )
}