'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'

type Report = {
  id: string
  reporter_id: string
  reported_user_id: string
  post_id: string | null
  reason: string
  status: string
  admin_notes: string | null
  created_at: string
}

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadReports = async () => {
      const { data, error } = await createClient().from('reports').select('*').order('created_at', { ascending: false })
      if (error) setMessage(error.message)
      else setReports(data ?? [])
      setLoading(false)
    }
    void loadReports()
  }, [])

  const updateStatus = async (id: string, status: string) => {
    const { error } = await createClient().from('reports').update({ status, resolved_at: status === 'resolved' || status === 'dismissed' ? new Date().toISOString() : null }).eq('id', id)
    if (error) setMessage(error.message)
    else setReports((current) => current.map((report) => report.id === id ? { ...report, status } : report))
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Admin review</h1>
      <p style={{ color: '#64748b' }}>Review open community safety reports.</p>
      {message ? <p role="alert" style={{ color: '#b91c1c' }}>{message}</p> : null}
      {loading ? <p>Loading reports...</p> : reports.length === 0 ? <p>No reports to review.</p> : <div style={{ display: 'grid', gap: '0.8rem' }}>{reports.map((report) => <article key={report.id} style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}><p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>{new Date(report.created_at).toLocaleString()}</p><p><strong>Reported user:</strong> {report.reported_user_id}</p><p><strong>Post:</strong> {report.post_id ?? 'Profile / user'}</p><p><strong>Reason:</strong> {report.reason}</p><p><strong>Status:</strong> {report.status}</p>{report.status !== 'resolved' && report.status !== 'dismissed' ? <div style={{ display: 'flex', gap: '0.6rem' }}><button type="button" onClick={() => updateStatus(report.id, 'reviewing')}>Mark reviewing</button><button type="button" onClick={() => updateStatus(report.id, 'resolved')}>Resolve</button><button type="button" onClick={() => updateStatus(report.id, 'dismissed')}>Dismiss</button></div> : null}</article>)}</div>}
    </main>
  )
}
