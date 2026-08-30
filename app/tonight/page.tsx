export default function TonightPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Tonight Feed</h1>
      <p style={{ color: '#666', margin: '1rem 0 2rem' }}>Nobody&apos;s out yet — be the first</p>

      <button style={{
        width: '100%',
        padding: '14px',
        background: '#000',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer'
      }}>
        Broadcast Status
      </button>
    </main>
  )
}