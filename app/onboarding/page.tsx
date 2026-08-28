import LogoutButton from '@/components/LogoutButton'

export default function OnboardingPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Welcome to Onboarding!</h1>
      <p>This is where new users set up their profile.</p>
      <div style={{ marginTop: '2rem' }}>
        <LogoutButton />
      </div>
    </main>
  )
}