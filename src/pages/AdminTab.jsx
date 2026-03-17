import { useState, useEffect, useCallback } from 'react'
import '../styles/TranslationTab.css'

function AdminTab({ user }) {
  const [approvers, setApprovers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', slack_user_id: '', role: 'reviewer' })
  const [submitting, setSubmitting] = useState(false)

  const fetchApprovers = useCallback(async () => {
    try {
      const res = await fetch('/api/approvers')
      if (!res.ok) throw new Error('Failed to load approvers')
      const data = await res.json()
      setApprovers(data.approvers || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchApprovers() }, [fetchApprovers])

  const handleAdd = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/approvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.status === 403) throw new Error('Admin access required')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add approver')
      }
      const data = await res.json()
      setApprovers(data.approvers)
      setFormData({ name: '', email: '', slack_user_id: '', role: 'reviewer' })
      setShowAddForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRoleChange = async (slackUserId, newRole) => {
    try {
      const res = await fetch(`/api/approvers/${slackUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.status === 403) throw new Error('Admin access required')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update role')
      }
      const data = await res.json()
      setApprovers(data.approvers)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (approver) => {
    const admins = approvers.filter(a => a.role === 'admin')
    if (approver.role === 'admin' && admins.length <= 1) {
      setError('Cannot remove the last admin')
      return
    }
    if (!window.confirm(`Remove ${approver.name} (${approver.email})?`)) return

    try {
      const res = await fetch(`/api/approvers/${approver.slack_user_id}`, { method: 'DELETE' })
      if (res.status === 403) throw new Error('Admin access required')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove approver')
      }
      const data = await res.json()
      setApprovers(data.approvers)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="loading-container"><div className="spinner"></div><p>Loading approvers...</p></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-6)' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Admin Panel</h2>
        <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : '+ Add Approver'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showAddForm && (
        <form onSubmit={handleAdd} style={{ background: 'var(--color-gray-50)', padding: 'var(--spacing-5)', borderRadius: 'var(--border-radius-lg)', marginBottom: 'var(--spacing-6)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 'var(--spacing-1)' }}>Name</label>
              <input className="input" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 'var(--spacing-1)' }}>Email</label>
              <input className="input" type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 'var(--spacing-1)' }}>Slack User ID</label>
              <input className="input" value={formData.slack_user_id} onChange={e => setFormData(f => ({ ...f, slack_user_id: e.target.value }))} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 'var(--spacing-1)' }}>Role</label>
              <select className="input role-select" value={formData.role} onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}>
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add Approver'}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="approvers-list">
        {approvers.map(approver => {
          const isSelf = approver.email === user.email
          const isLastAdmin = approver.role === 'admin' && approvers.filter(a => a.role === 'admin').length <= 1
          return (
            <div className="approver-row" key={approver.slack_user_id}>
              <div>
                <strong>{approver.name}</strong>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)' }}>{approver.email}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
                <select
                  className="role-select"
                  value={approver.role || 'reviewer'}
                  onChange={e => handleRoleChange(approver.slack_user_id, e.target.value)}
                  disabled={isSelf}
                  title={isSelf ? 'Cannot change your own role' : ''}
                >
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => handleRemove(approver)}
                  disabled={isSelf || isLastAdmin}
                  title={isSelf ? 'Cannot remove yourself' : isLastAdmin ? 'Cannot remove the last admin' : 'Remove approver'}
                >
                  Remove
                </button>
              </div>
            </div>
          )
        })}
        {approvers.length === 0 && <p style={{ color: 'var(--color-gray-500)', textAlign: 'center' }}>No approvers configured.</p>}
      </div>
    </div>
  )
}

export default AdminTab
