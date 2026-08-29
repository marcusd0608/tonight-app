export default function TonightPage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Profile</h1>
      <p style={{ color: '#666', margin: '2rem 0' }}>Nobody's out yet — be the first</p>
      
      {/* Positioned button ready for tomorrow's wiring */}
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